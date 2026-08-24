const SCROLL_PADDING = 8;

/**
 * Scrolls a row into view inside its scrollable container, accounting for any
 * `<thead>` rendered with `position: sticky` inside the container (so the row
 * doesn't slide under the sticky header). When the container has no thead,
 * behaves as a plain "scroll with padding".
 */
export const scrollRowIntoView = (container: HTMLElement | null, row: HTMLElement | null): void => {
  if (!container || !row) return;

  const headerHeight = container.querySelector('thead')?.offsetHeight ?? 0;
  const rowTop = row.offsetTop;
  const rowBottom = rowTop + row.offsetHeight;
  const viewTop = container.scrollTop + headerHeight;
  const viewBottom = container.scrollTop + container.clientHeight;

  if (rowTop < viewTop) {
    container.scrollTo({ top: rowTop - headerHeight - SCROLL_PADDING, behavior: 'smooth' });
  } else if (rowBottom > viewBottom) {
    container.scrollTo({
      top: rowBottom - container.clientHeight + SCROLL_PADDING,
      behavior: 'smooth',
    });
  }
};
