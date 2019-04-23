(function() {
  'use strict'

  let queue = window.teltrics.q || []

  let config = {
    'siteId': '',
    'trackerUrl': 'https://collector.teltrics.com/collectPageview'
  }

  const commands = {
    'trackPageview': trackPageview,
    'setSiteId': setSiteId
  }

  function setSiteId(value) {
    config['siteId'] = value
  }

  function trackPageview(vars) {
    vars = vars || {}

    //respect do not track user requests
    if ('doNotTrack' in navigator && navigator.doNotTrack === "1") {
      return
    }

    //ignore prerendered pages
    if ( 'visibilityState' in document && document.visibilityState === 'prerender' ) {
      return
    }

    // if body did not load yet, try again at dom ready event
    if ( document.body === null ) {
      document.addEventListener('DOMContentLoaded', () => {
        trackPageview(vars)
      })
      return
    }

    //  parse request, use canonical if there is one
    let req = window.location

    //don't track if host is empty or served over local host
    if (req.host === '' || req.hostname === 'localhost' || req.hostname === '127.0.0.1') {
      return
    }

    // find canonical URL
    let canonical = document.querySelector('link[rel="canonical"][href]');
    if(canonical) {
      let a = document.createElement('a');
      a.href = canonical.href;
      // use parsed canonical as location object
      req = a;
    }

    let path = req.pathname + req.search
    if (!path) {
      path = '/'
    }

    // determine hostname
    let hostname = vars.hostname || ( req.protocol + '//' + req.hostname )

    // only set referrer if not internal
    let referrer = vars.referrer || ''
    if(document.referrer.indexOf(hostname) < 0) {
      referrer = document.referrer
    }

    let data = getData()
    const d = {
      id: randomString(20),
      pid: data.previousPageviewId || '',
      p: path,
      h: hostname,
      r: referrer,
      u: data.pagesViewed.indexOf(path) == -1 ? 1 : 0,
      nv: data.isNewVisitor ? 1 : 0,
      ns: data.isNewSession ? 1 : 0,
      sid: config.siteId
    }

    let url = config.trackerUrl
    let img = document.createElement('img')
    img.setAttribute('alt', '')
    img.setAttribute('aria-hidden', 'true')
    img.style.display = 'none'
    img.src = url + stringifyObject(d)
    img.addEventListener('load', function() {
      let now = new Date()
      let midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 24, 0, 0)

      //update data in cookies
      if (data.pagesViewed.indexOf(path) == -1) {
        data.pagesViewed.push(path)
      }
      data.previousPageviewId = d.id
      data.isNewVisitor = false
      data.isNewSession = false
      data.lastSeen = +new Date()
      setCookie('_teltrics', JSON.stringify(data), { expires: midnight, path: '/' })
      //remove tracking img from DOM
      document.body.removeChild(img)
    })

    //in case img.onload never fires, remove img after 5 seconds and reset src to cancel request, extended from 1 sec for slow connections
    window.setTimeout(() => {
      if (!img.parentNode) {
        return
      }
      img.src = ''
      document.body.removeChild(img)
    }, 5000)

    document.body.appendChild(img)
  }

  function getCookie(name) {
    const cookies = document.cookie ? document.cookie.split('; ') : []
    for (var i=0; i < cookies.length; i++) {
      const parts = cookies[i].split('=')
      if (decodeURIComponent(parts[0]) !== name) {
        continue
      }
      const cookie = parts.slice(1).join('=')
      return decodeURIComponent(cookie)
    }
    return ''
  }

  function setCookie(name, data, args) {
    name = encodeURIComponent(name)
    data = encodeURIComponent(String(data))

    let str = name + '=' + data

    if (args.path) {
      str += ';path=' + args.path
    }

    if (args.expires) {
      str += ';expires='+args.expires.toUTCString()
    }

    document.cookie = str
  }

  function newVisitorData() {
    return {
      isNewVisitor: true,
      isNewSession: true,
      pagesViewed: [],
      previousPageviewId: '',
      lastSeen: +new Date()
    }
  }

  function getData() {
    let thirtyMinsAgo = new Date()
    thirtyMinsAgo.setMinutes(thirtyMinsAgo.getMinutes() - 30)

    let data = getCookie('_teltrics')

    if (!data) {
      return newVisitorData()
    }

    try {
      data = JSON.parse(data)
    } catch(e) {
      console.error(e)
      return newVisitorData()
    }

    if (data.lastSeen < (+thirtyMinsAgo)) {
      data.isNewSession = true
    }
    return data
  }

  function randomString(n) {
    var s = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return Array(n).join().split(',').map(() => s.charAt(Math.floor(Math.random() * s.length))).join('')
  }

  function stringifyObject(obj) {
    var keys = Object.keys(obj);

    return '?' +
        keys.map(function(k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
        }).join('&');
  }

  var his = window.history
  if (his && his.pushState && Event && window.dispatchEvent) {
    var stateListener = function(type) {
      var orig = his[type]
      return function() {
        var rv = orig.apply(this, arguments)
        var event = new Event(type)
        event.arguments = arguments
        window.dispatchEvent(event)
        return rv
      }
    }
    his.pushState = stateListener('pushState')
    window.addEventListener('pushState', trackPageview)
  }

  // override global teltrics object
  window.teltrics = function() {
    var args = [].slice.call(arguments)
    var c = args.shift()
    commands[c].apply(this, args)
  }

  // process existing queue
  queue.forEach((i) => teltrics.apply(this, i))
})()
