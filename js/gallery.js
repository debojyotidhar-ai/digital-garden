(() => {
  'use strict';

  const filters = document.querySelector('#gallery-filters');
  const cards = document.querySelectorAll('.gallery-card[data-category]');

  if (!filters || !cards.length) return;

  filters.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const category = button.dataset.filter;

      filters.querySelectorAll('[data-filter]').forEach((filter) => {
        filter.setAttribute('aria-pressed', String(filter === button));
      });

      cards.forEach((card) => {
        card.style.display =
          category === 'all' || card.dataset.category === category ? '' : 'none';
      });
    });
  });
})();
