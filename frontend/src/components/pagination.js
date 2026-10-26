/**
 * Reusable Pagination Controls UI Primitive
 * 
 * Accessible pagination component supporting:
 * - Dynamic page jump buttons with smart ellipsis
 * - Previous / Next navigation
 * - Total item counts & current page bounds
 * - Optional page-size limit dropdown
 */

/**
 * Render pagination controls
 * @param {Object} options
 * @param {number} [options.page=1] - Current active page (1-based)
 * @param {number} [options.limit=20] - Number of items per page
 * @param {number} [options.total=0] - Total item count across all pages
 * @param {Array<number>} [options.limitOptions=[10, 20, 50]] - Available page sizes
 * @param {string} [options.containerId='pagination-controls']
 * @returns {string} HTML string
 */
export function renderPagination({
  page = 1,
  limit = 20,
  total = 0,
  limitOptions = [10, 20, 50],
  containerId = 'pagination-controls',
} = {}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startItem = total === 0 ? 0 : (currentPage - 1) * limit + 1;
  const endItem = Math.min(currentPage * limit, total);

  // Generate page numbers with ellipsis
  const pages = [];
  const delta = 2; // numbers each side of current page

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return `
    <nav class="pagination" id="${containerId}" role="navigation" aria-label="Pagination Navigation">
      <div class="pagination-info">
        Showing <strong>${startItem}–${endItem}</strong> of <strong>${total}</strong> results
      </div>

      <div class="flex items-center gap-3">
        <div class="pagination-pages">
          <button
            class="pagination-btn"
            data-page="${currentPage - 1}"
            ${currentPage <= 1 ? 'disabled aria-disabled="true"' : ''}
            aria-label="Go to previous page"
          >
            &larr; Prev
          </button>

          ${pages
            .map((p) => {
              if (p === '...') {
                return `<span class="pagination-btn" style="border:none;background:transparent;cursor:default;" aria-hidden="true">&hellip;</span>`;
              }
              const isActive = p === currentPage;
              return `
                <button
                  class="pagination-btn ${isActive ? 'active' : ''}"
                  data-page="${p}"
                  ${isActive ? 'aria-current="page"' : ''}
                  aria-label="Page ${p}"
                >
                  ${p}
                </button>
              `;
            })
            .join('')}

          <button
            class="pagination-btn"
            data-page="${currentPage + 1}"
            ${currentPage >= totalPages ? 'disabled aria-disabled="true"' : ''}
            aria-label="Go to next page"
          >
            Next &rarr;
          </button>
        </div>

        ${
          limitOptions && limitOptions.length > 0
            ? `
          <div class="flex items-center gap-1">
            <label for="${containerId}-limit" class="text-xs text-muted">Per page:</label>
            <select id="${containerId}-limit" class="pagination-limit-select" data-action="change-limit">
              ${limitOptions
                .map((opt) => `<option value="${opt}" ${opt === limit ? 'selected' : ''}>${opt}</option>`)
                .join('')}
            </select>
          </div>
        `
            : ''
        }
      </div>
    </nav>
  `;
}

/**
 * Attach listeners for pagination buttons and limit select
 * @param {HTMLElement|string} target - Container element or selector
 * @param {Function} onPageChange - Callback(newPage: number)
 * @param {Function} [onLimitChange] - Callback(newLimit: number)
 * @returns {Function} cleanup function
 */
export function attachPaginationListeners(target, onPageChange, onLimitChange = null) {
  const container = typeof target === 'string' ? document.querySelector(target) : target;
  if (!container) return () => {};

  function handleClick(e) {
    const btn = e.target.closest('.pagination-btn[data-page]');
    if (btn && !btn.disabled) {
      const targetPage = parseInt(btn.getAttribute('data-page'), 10);
      if (!isNaN(targetPage) && onPageChange) {
        onPageChange(targetPage);
      }
    }
  }

  function handleChange(e) {
    if (e.target.matches('.pagination-limit-select') && onLimitChange) {
      const newLimit = parseInt(e.target.value, 10);
      if (!isNaN(newLimit)) {
        onLimitChange(newLimit);
      }
    }
  }

  container.addEventListener('click', handleClick);
  container.addEventListener('change', handleChange);

  return function cleanup() {
    container.removeEventListener('click', handleClick);
    container.removeEventListener('change', handleChange);
  };
}
