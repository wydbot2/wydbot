import {
  type CSSProperties,
  type FC,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
  cloneElement,
  useRef,
  useState,
} from 'react';
import {
  arrow,
  flip,
  FloatingPortal,
  offset,
  type Placement,
  safePolygon,
  shift,
  useFloating,
  useHover,
  useInteractions,
} from '@floating-ui/react';

type TooltipVariant = 'default' | 'error';
type TooltipChrome = 'default' | 'glass';
type Side = 'top' | 'right' | 'bottom' | 'left';

interface TooltipProps {
  content: ReactNode;
  children: ReactElement<HTMLAttributes<HTMLElement> & RefAttributes<HTMLElement>>;
  placement?: Placement;
  variant?: TooltipVariant;
  chrome?: TooltipChrome;
  openDelay?: number;
  closeDelay?: number;
}

const VARIANT_CLASSES: Record<TooltipVariant, string> = {
  default: 'border-gray-600 text-gray-100',
  error: 'border-red-800/60 text-red-200',
};

const GLASS_SURFACE =
  'overflow-hidden rounded-lg border border-gray-600 bg-gray-900/80 text-sm text-gray-100 shadow-lg backdrop-blur-sm backdrop-saturate-[1.4] select-none';

const ARROW_OPPOSITE: Record<Side, Side> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
};

/** Hover tooltip built on floating-ui. Clones the child element to attach
 *  reference ref and hover handlers, avoiding an extra wrapper node. */
export const Tooltip: FC<TooltipProps> = ({
  content,
  children,
  placement = 'bottom',
  variant = 'default',
  chrome = 'default',
  openDelay = 150,
  closeDelay = 0,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const arrowRef = useRef<HTMLDivElement>(null);

  const {
    refs,
    floatingStyles,
    context,
    middlewareData,
    placement: actualPlacement,
  } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    middleware:
      chrome === 'glass'
        ? [offset(6), flip(), shift({ padding: 8 }), arrow({ element: arrowRef })]
        : [offset(6), flip(), shift({ padding: 8 })],
  });
  const hover = useHover(context, {
    delay: { open: openDelay, close: closeDelay },
    handleClose: chrome === 'glass' ? safePolygon() : null,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover]);
  const arrowSide = actualPlacement.split('-')[0] as Side;

  return (
    <>
      {cloneElement(children, { ref: refs.setReference, ...getReferenceProps() })}
      {isOpen && (
        <FloatingPortal>
          {chrome === 'glass' ? (
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              role="tooltip"
              className="z-50 w-max max-w-[360px] min-w-[280px]"
            >
              <div
                className={GLASS_SURFACE}
                style={{
                  backgroundImage:
                    'linear-gradient(180deg, rgb(255 255 255 / 0.04), transparent 80px)',
                }}
              >
                {content}
              </div>
              <div
                ref={arrowRef}
                aria-hidden
                className="absolute h-2 w-2 rotate-45 border-r border-b border-gray-600 bg-gray-900/80 backdrop-blur-sm backdrop-saturate-[1.4]"
                style={
                  {
                    left: middlewareData.arrow?.x,
                    top: middlewareData.arrow?.y,
                    [ARROW_OPPOSITE[arrowSide]]: '-4px',
                  } as CSSProperties
                }
              />
            </div>
          ) : (
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              role="tooltip"
              className={`z-50 max-w-xs rounded border bg-gray-900 px-3 py-2 text-xs shadow-lg ${VARIANT_CLASSES[variant]}`}
            >
              {content}
            </div>
          )}
        </FloatingPortal>
      )}
    </>
  );
};
