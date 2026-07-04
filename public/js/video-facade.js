(function () {
  'use strict';

  function loadVideo(facade) {
    var videoId = facade.getAttribute('data-video-id');
    if (!videoId || facade.classList.contains('is-loaded')) return;

    var iframe = document.createElement('iframe');
    iframe.src =
      'https://www.youtube-nocookie.com/embed/' +
      encodeURIComponent(videoId) +
      '?autoplay=1&rel=0';
    iframe.title = facade.getAttribute('data-video-title') || 'YouTube video';
    iframe.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';

    facade.innerHTML = '';
    facade.appendChild(iframe);
    facade.classList.add('is-loaded');
  }

  function init() {
    document.querySelectorAll('.video-facade').forEach(function (facade) {
      var btn = facade.querySelector('.video-facade-play');
      var handler = function () {
        loadVideo(facade);
      };
      if (btn) {
        btn.addEventListener('click', handler);
      }
      facade.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handler();
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
