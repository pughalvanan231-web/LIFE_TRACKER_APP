/**
 * Reusable Form Validation UI Primitives
 * 
 * Provides pure validation rules and DOM state helpers for accessible error presentation.
 */

export const ValidationRules = {
  required(value, label = 'This field') {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim().length === 0)) {
      return `${label} is required.`;
    }
    return null;
  },

  email(value, label = 'Email address') {
    if (!value) return null; // Let required rule check empty
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(value.trim())) {
      return `${label} must be a valid email format (e.g. user@example.com).`;
    }
    return null;
  },

  minLength(min, label = 'This field') {
    return (value) => {
      if (!value) return null;
      if (typeof value === 'string' && value.trim().length < min) {
        return `${label} must be at least ${min} characters.`;
      }
      return null;
    };
  },

  maxLength(max, label = 'This field') {
    return (value) => {
      if (!value) return null;
      if (typeof value === 'string' && value.trim().length > max) {
        return `${label} cannot exceed ${max} characters.`;
      }
      return null;
    };
  },

  numberRange(min, max, label = 'Value') {
    return (value) => {
      if (value === null || value === undefined || value === '') return null;
      const num = Number(value);
      if (isNaN(num)) return `${label} must be a valid number.`;
      if (min !== undefined && num < min) return `${label} must be at least ${min}.`;
      if (max !== undefined && num > max) return `${label} cannot exceed ${max}.`;
      return null;
    };
  },

  dateFormat(label = 'Date') {
    return (value) => {
      if (!value) return null;
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(value)) {
        return `${label} must be in YYYY-MM-DD format.`;
      }
      return null;
    };
  },

  timeFormat(label = 'Time') {
    return (value) => {
      if (!value) return null;
      const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!timeRegex.test(value)) {
        return `${label} must be in 24-hour HH:MM format.`;
      }
      return null;
    };
  },

  dateOrder(startDate, endDate, startLabel = 'Start date', endLabel = 'Target date') {
    if (!startDate || !endDate) return null;
    if (startDate > endDate) {
      return `${startLabel} cannot be later than ${endLabel}.`;
    }
    return null;
  },
};

/**
 * Render field validation error HTML string
 * @param {string} [message]
 * @param {string} [id]
 * @returns {string}
 */
export function renderFieldError(message, id = null) {
  if (!message) return '';
  const idAttr = id ? `id="${id}"` : '';
  return `
    <div class="form-error-msg" ${idAttr} role="alert" aria-live="polite">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>${message}</span>
    </div>
  `;
}

/**
 * Apply validation state directly to an input element in the DOM
 * @param {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} input
 * @param {boolean} isValid
 * @param {string|null} errorMessage
 */
export function applyFieldValidationState(input, isValid, errorMessage = null) {
  if (!input) return;

  const errorContainer = input.parentElement?.querySelector('.form-error-msg');
  if (errorContainer) {
    errorContainer.remove();
  }

  if (isValid) {
    input.classList.remove('is-invalid');
    input.classList.add('is-valid');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  } else {
    input.classList.remove('is-valid');
    input.classList.add('is-invalid');
    input.setAttribute('aria-invalid', 'true');

    if (errorMessage) {
      const errorId = `${input.id || 'input'}-error`;
      input.setAttribute('aria-describedby', errorId);
      input.insertAdjacentHTML('afterend', renderFieldError(errorMessage, errorId));
    }
  }
}

/**
 * Clear validation classes and messages from an input element
 * @param {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} input
 */
export function clearFieldValidationState(input) {
  if (!input) return;
  input.classList.remove('is-invalid', 'is-valid');
  input.removeAttribute('aria-invalid');
  input.removeAttribute('aria-describedby');

  const errorContainer = input.parentElement?.querySelector('.form-error-msg');
  if (errorContainer) {
    errorContainer.remove();
  }
}

/**
 * Validate a whole dictionary of values against rules
 * @param {Object} values - Form field values
 * @param {Object} rules - Schema of field rules: { [field]: Array<Function> }
 * @returns {{ isValid: boolean, errors: Object }}
 */
export function validateForm(values, rules) {
  const errors = {};
  let isValid = true;

  for (const [field, fieldRules] of Object.entries(rules)) {
    const val = values[field];
    for (const rule of fieldRules) {
      const err = rule(val);
      if (err) {
        errors[field] = err;
        isValid = false;
        break; // stop on first error for this field
      }
    }
  }

  return { isValid, errors };
}
