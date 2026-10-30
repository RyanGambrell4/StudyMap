/*
 * Blog reading rail: a sticky "On this page" list beside the article on wide
 * screens, with the current section highlighted. Progressive enhancement only:
 * the in-article TOC stays in the HTML for crawlers, phones and no-JS readers.
 */
(function () {
  var MIN_WIDTH = 1200
  var body = document.querySelector('.article .container, .post-body, .article-body')
  if (!body) return
  var heads = Array.prototype.filter.call(body.querySelectorAll('h2[id]'), function (h) {
    return !h.closest('.toc, .faq-section, .sources-section, .inline-cta, .cta-block, .post-cta, .key-takeaways')
  })
  if (heads.length < 3) return

  var label = function (h) {
    var t = (h.textContent || '').replace(/#\s*$/, '').trim()
    return t.length > 60 ? t.slice(0, 57).replace(/\s+\S*$/, '') + '…' : t
  }

  var rail = document.createElement('aside')
  rail.className = 'ed-rail'
  rail.setAttribute('aria-label', 'On this page')
  var html = '<p class="ed-rail-label">On this page</p><ol>'
  heads.forEach(function (h) {
    html += '<li><a href="#' + h.id + '">' + label(h).replace(/</g, '&lt;') + '</a></li>'
  })
  html += '</ol><a class="ed-rail-cta" href="/app?signup=1">Build a study plan with StudyEdge AI &rarr;</a>'
  rail.innerHTML = html
  document.body.appendChild(rail)
  var links = rail.querySelectorAll('ol a')

  var startEl = body.querySelector('.toc') || heads[0]
  var stopEl = document.querySelector('.keep-reading, .faq-section, .related-links, footer')

  function place() {
    var r = body.getBoundingClientRect()
    rail.style.left = Math.round(r.right + 56) + 'px'
  }
  function update() {
    if (window.innerWidth < MIN_WIDTH) { rail.classList.remove('is-on'); return }
    var startY = startEl.getBoundingClientRect().bottom
    var stopY = stopEl ? stopEl.getBoundingClientRect().top : Infinity
    var on = startY < 0 && stopY > window.innerHeight * 0.6
    rail.classList.toggle('is-on', on)
    var current = 0
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top < 140) current = i
    }
    for (var j = 0; j < links.length; j++) links[j].classList.toggle('is-active', j === current)
  }
  var ticking = false
  function onScroll() {
    if (ticking) return
    ticking = true
    window.requestAnimationFrame(function () { update(); ticking = false })
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', function () { place(); update() })
  place(); update()
})()
