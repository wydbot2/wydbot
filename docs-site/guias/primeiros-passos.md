# Primeiros passos

Este guia te leva do zero ao seu primeiro script de macro funcional. Se você já editou um macro antes mas nunca tinha usado um step do tipo `script`, comece por aqui.

## O que é um step `script`?

O macro do wydbot.com executa uma sequência de **steps** (`walk`, `interact`, `delay`, `script`). Quando o engine chega num step `script`, ele executa o código JavaScript que você escreveu, com acesso ao objeto global `ctx`.

Diferente dos outros steps (que descrevem _ações_), o step `script` descreve _decisão_: avalia o estado atual e pode pedir pra pausar o macro, logar algo, ou disparar uma ação.

## Seu primeiro script

Cole isto no editor:

```js
ctx.log('script rodando');

if (ctx.player.hp < ctx.player.maxHp / 2) {
  ctx.macro.pause('hp baixo');
}
```

O que acontece:

- A primeira linha imprime no painel de logs do macro.
- Se o HP estiver abaixo da metade, o macro pausa **depois** que o script termina (`ctx.macro.pause` é **lazy\***, não interrompe na hora).

---

\* **lazy** = adiado. A engine não aplica o efeito no instante da chamada — armazena a intenção e só aplica quando o script termina. Se vários `if` chamarem `pause()`, a última chamada vence.
