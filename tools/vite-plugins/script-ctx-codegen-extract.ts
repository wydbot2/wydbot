/**
 * Extracts ScriptCtxMeta from a ts-morph SourceFile by walking the AST of
 * the `Item`, `ItemShort`, `Entidade` and `ScriptCtx` interfaces declared in
 * `src/renderer/lib/script-ctx.ts`.
 *
 * Walks raw AST nodes via `Node.is*` predicates instead of resolving types
 * through the type checker — this preserves the distinction between
 * `Readonly<{...}>` and `{...}` (which the checker would erase) and runs
 * even when the source file has unresolved type errors during dev.
 *
 * Special-cased generics: `Readonly<T>`, `ReadonlyArray<T>`, `Promise<T>`.
 * Any other TypeNode the extractor does not recognize becomes
 * `{ kind: 'unsupported', raw: text }` — visible in the JSON, never crashes.
 */
import {
  Node,
  SyntaxKind,
  type InterfaceDeclaration,
  type JSDoc,
  type MethodSignature,
  type ParameterDeclaration,
  type PropertySignature,
  type SourceFile,
  type TypeNode,
  type TypeReferenceNode,
  type LiteralTypeNode,
  type TypeElementTypes,
} from 'ts-morph';
import type {
  InterfaceMeta,
  JsDocMeta,
  MemberMeta,
  MethodMemberMeta,
  ParamMeta,
  PrimitiveTypeName,
  PropertyMemberMeta,
  ScriptCtxMeta,
  TypeMeta,
} from './script-ctx-codegen-types';

const EXPOSED_INTERFACES = ['Item', 'ItemShort', 'Entidade', 'ScriptCtx'] as const;

export const extractScriptCtxMeta = (sourceFile: SourceFile, sourcePath: string): ScriptCtxMeta => {
  const found = sourceFile
    .getInterfaces()
    .filter((iface) => (EXPOSED_INTERFACES as readonly string[]).includes(iface.getName()));

  const foundNames = found.map((iface) => iface.getName());
  const missing = EXPOSED_INTERFACES.filter((n) => !foundNames.includes(n));
  if (missing.length > 0) {
    throw new Error(
      `[script-ctx-codegen] missing exposed interface(s) in ${sourcePath}: ${missing.join(', ')}`,
    );
  }

  const ordered = [...found].sort((a, b) => a.getStartLineNumber() - b.getStartLineNumber());

  return {
    schemaVersion: 1,
    sourcePath,
    generatedAt: new Date().toISOString(),
    interfaces: ordered.map(extractInterface),
  };
};

const extractInterface = (iface: InterfaceDeclaration): InterfaceMeta => ({
  name: iface.getName(),
  jsDoc: extractJsDoc(canonicalJsDoc(iface.getJsDocs())),
  members: iface
    .getMembers()
    .map(extractMember)
    .filter((m): m is MemberMeta => m !== null),
});

const extractMember = (member: TypeElementTypes): MemberMeta | null => {
  if (Node.isPropertySignature(member)) {
    return extractPropertyMember(member);
  }
  if (Node.isMethodSignature(member)) {
    return extractMethodMember(member);
  }
  return null;
};

const extractPropertyMember = (prop: PropertySignature): PropertyMemberMeta => ({
  kind: 'property',
  name: prop.getName(),
  readonly: prop.isReadonly(),
  optional: prop.hasQuestionToken(),
  jsDoc: extractJsDoc(canonicalJsDoc(prop.getJsDocs())),
  type: extractTypeFromNode(prop.getTypeNode()),
});

const extractMethodMember = (method: MethodSignature): MethodMemberMeta => {
  const jsDoc = extractJsDoc(canonicalJsDoc(method.getJsDocs()));
  const baseParams = method.getParameters().map(extractParam);
  const params: ParamMeta[] = baseParams.map((p) => ({
    ...p,
    description: jsDoc?.params[p.name] ?? null,
  }));
  return {
    kind: 'method',
    name: method.getName(),
    optional: method.hasQuestionToken(),
    jsDoc,
    params,
    returns: extractTypeFromNode(method.getReturnTypeNode()),
  };
};

const extractParam = (param: ParameterDeclaration): ParamMeta => ({
  name: param.getName(),
  optional: param.hasQuestionToken(),
  type: extractTypeFromNode(param.getTypeNode()),
  description: null,
});

const extractTypeFromNode = (typeNode: TypeNode | undefined): TypeMeta => {
  if (!typeNode) return { kind: 'unsupported', raw: '?' };

  if (Node.isTypeReference(typeNode)) {
    return extractTypeReference(typeNode);
  }

  if (Node.isArrayTypeNode(typeNode)) {
    return {
      kind: 'array',
      readonly: false,
      element: extractTypeFromNode(typeNode.getElementTypeNode()),
    };
  }

  if (Node.isTypeLiteral(typeNode)) {
    return {
      kind: 'object',
      members: typeNode
        .getMembers()
        .map(extractMember)
        .filter((m): m is MemberMeta => m !== null),
    };
  }

  if (Node.isUnionTypeNode(typeNode)) {
    return {
      kind: 'union',
      variants: typeNode.getTypeNodes().map(extractTypeFromNode),
    };
  }

  if (Node.isLiteralTypeNode(typeNode)) {
    return extractLiteralType(typeNode);
  }

  const primitive = matchPrimitiveKeyword(typeNode.getKind());
  if (primitive) {
    return { kind: 'primitive', name: primitive };
  }

  return { kind: 'unsupported', raw: typeNode.getText() };
};

const extractTypeReference = (typeNode: TypeReferenceNode): TypeMeta => {
  const name = typeNode.getTypeName().getText();
  const args = typeNode.getTypeArguments();

  if (name === 'Promise' && args.length === 1) {
    return { kind: 'promise', resolved: extractTypeFromNode(args[0]) };
  }

  if (name === 'Readonly' && args.length === 1) {
    const inner = extractTypeFromNode(args[0]);
    if (inner.kind === 'object') {
      return {
        kind: 'object',
        members: inner.members.map((m) => (m.kind === 'property' ? { ...m, readonly: true } : m)),
      };
    }
    return inner;
  }

  if (name === 'ReadonlyArray' && args.length === 1) {
    return {
      kind: 'array',
      readonly: true,
      element: extractTypeFromNode(args[0]),
    };
  }

  return {
    kind: 'reference',
    name,
    typeArgs: args.map(extractTypeFromNode),
  };
};

const extractLiteralType = (typeNode: LiteralTypeNode): TypeMeta => {
  const literal = typeNode.getLiteral();
  if (Node.isStringLiteral(literal)) {
    return { kind: 'literal', value: literal.getLiteralText() };
  }
  if (Node.isNumericLiteral(literal)) {
    return { kind: 'literal', value: Number(literal.getLiteralText()) };
  }
  const kind = literal.getKind();
  if (kind === SyntaxKind.TrueKeyword) {
    return { kind: 'literal', value: true };
  }
  if (kind === SyntaxKind.FalseKeyword) {
    return { kind: 'literal', value: false };
  }
  if (kind === SyntaxKind.NullKeyword) {
    return { kind: 'primitive', name: 'null' };
  }
  return { kind: 'unsupported', raw: typeNode.getText() };
};

const matchPrimitiveKeyword = (kind: SyntaxKind): PrimitiveTypeName | null => {
  switch (kind) {
    case SyntaxKind.NumberKeyword:
      return 'number';
    case SyntaxKind.StringKeyword:
      return 'string';
    case SyntaxKind.BooleanKeyword:
      return 'boolean';
    case SyntaxKind.VoidKeyword:
      return 'void';
    case SyntaxKind.UndefinedKeyword:
      return 'undefined';
    case SyntaxKind.UnknownKeyword:
      return 'unknown';
    case SyntaxKind.AnyKeyword:
      return 'any';
    default:
      return null;
  }
};

const canonicalJsDoc = (jsDocs: readonly JSDoc[]): JSDoc | null => {
  if (jsDocs.length === 0) return null;
  return jsDocs[jsDocs.length - 1] ?? null;
};

const extractJsDoc = (jsDoc: JSDoc | null): JsDocMeta | null => {
  if (!jsDoc) return null;

  const description = jsDoc.getDescription().trim();
  const tags = jsDoc.getTags();

  const params: Record<string, string> = {};
  let returns: string | null = null;
  const otherTags: { tag: string; text: string }[] = [];

  for (const tag of tags) {
    const tagName = tag.getTagName();

    if (tagName === 'param' && Node.isJSDocParameterTag(tag)) {
      params[tag.getName()] = (tag.getCommentText() ?? '').trim();
      continue;
    }
    if (tagName === 'returns' || tagName === 'return') {
      returns = (tag.getCommentText() ?? '').trim();
      continue;
    }
    // Other tags (e.g. @see, @example, @deprecated, custom): the parsed
    // `getCommentText()` is unreliable because ts-morph treats the first
    // token as a name reference for some tags (`@see ctx.player` → comment
    // text becomes the next line's `*` marker). Fall back to the tag's raw
    // source text and strip the leading `@name` + JSDoc continuation `* `.
    otherTags.push({ tag: tagName, text: rawTagBody(tag) });
  }

  if (
    !description &&
    Object.keys(params).length === 0 &&
    returns === null &&
    otherTags.length === 0
  ) {
    return null;
  }

  return { description, params, returns, tags: otherTags };
};

const rawTagBody = (tag: { getText(): string }): string => {
  const raw = tag.getText();
  const withoutTagName = raw.replace(/^@\S+(?:\s*\{[^}]*\})?\s*/, '');
  return withoutTagName
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, ''))
    .join('\n')
    .trim();
};
