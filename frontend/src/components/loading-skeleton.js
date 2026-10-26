/**
 * Loading Skeleton UI Primitives
 * 
 * Provides accessible, animated placeholder primitives that preserve layout geometry
 * while dynamic data is in flight.
 */

/**
 * Render a basic skeleton box or bar.
 * @param {Object} options
 * @param {string|number} [options.width='100%']
 * @param {string|number} [options.height='16px']
 * @param {string} [options.borderRadius='var(--radius-sm)']
 * @param {string} [options.className='']
 * @returns {string} HTML string
 */
export function renderSkeletonBox({
  width = '100%',
  height = '16px',
  borderRadius = 'var(--radius-sm)',
  className = '',
} = {}) {
  const w = typeof width === 'number' ? `${width}px` : width;
  const h = typeof height === 'number' ? `${height}px` : height;

  return `<span class="skeleton ${className}" style="width: ${w}; height: ${h}; border-radius: ${borderRadius}; display: inline-block;" aria-hidden="true"></span>`;
}

/**
 * Render lines of text skeleton.
 * @param {number} [lines=3]
 * @param {string} [lastLineWidth='70%']
 * @returns {string} HTML string
 */
export function renderSkeletonText(lines = 3, lastLineWidth = '70%') {
  let html = `<div class="skeleton-text-group" role="status" aria-label="Loading content...">`;
  for (let i = 0; i < lines; i++) {
    const isLast = i === lines - 1;
    const width = isLast ? lastLineWidth : '100%';
    html += renderSkeletonBox({ width, height: '14px', className: 'skeleton-text' });
  }
  html += `</div>`;
  return html;
}

/**
 * Render skeleton placeholder cards for lists and grids.
 * @param {Object} options
 * @param {number} [options.count=3]
 * @param {string} [options.layout='vertical'] - 'vertical' | 'grid'
 * @returns {string} HTML string
 */
export function renderSkeletonCardList({ count = 3, layout = 'vertical' } = {}) {
  const containerClass = layout === 'grid' ? 'grid grid-cols-3' : 'flex flex-col gap-3';
  let html = `<div class="${containerClass}" role="status" aria-label="Loading items...">`;

  for (let i = 0; i < count; i++) {
    html += `
      <div class="skeleton-card">
        <div class="flex items-center justify-between">
          ${renderSkeletonBox({ width: '45%', height: '20px', className: 'skeleton-title' })}
          ${renderSkeletonBox({ width: '64px', height: '22px', borderRadius: 'var(--radius-full)' })}
        </div>
        ${renderSkeletonText(2, '60%')}
        <div class="flex items-center justify-between" style="margin-top: var(--space-2);">
          ${renderSkeletonBox({ width: '80px', height: '12px' })}
          ${renderSkeletonBox({ width: '100px', height: '28px', borderRadius: 'var(--radius-md)' })}
        </div>
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

/**
 * Render skeleton placeholder for metric statistics.
 * @param {number} [count=4]
 * @returns {string} HTML string
 */
export function renderSkeletonMetricRow(count = 4) {
  let html = `<div class="grid grid-cols-4" role="status" aria-label="Loading metrics...">`;

  for (let i = 0; i < count; i++) {
    html += `
      <div class="card flex flex-col gap-2">
        ${renderSkeletonBox({ width: '50%', height: '12px' })}
        ${renderSkeletonBox({ width: '70%', height: '28px' })}
        ${renderSkeletonBox({ width: '35%', height: '10px' })}
      </div>
    `;
  }

  html += `</div>`;
  return html;
}
