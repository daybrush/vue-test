import $ from 'jquery'
import 'bootstrap'
import { Frame } from 'scenejs'
import { createPopper, Placement } from '@popperjs/core'
import domtoimage from 'dom-to-image'

export default {
  /**
   * 把 selected作为一组，更新他们的grouped结构体
   * @param selectedItems
   * @param isGrouped
   */
  setSelectedItemAsGroup (designVm:any, selectedItems, isGrouped){
    const grouped = {}
    for (const itemid in selectedItems) {
      const pageid = selectedItems[itemid].pageid
      const pageindex = designVm.$store.getters.findPageIndex(pageid)
      const shadow = designVm.$store.getters.getDesignItemValue(pageindex, itemid, 'shadow')
      grouped[itemid] = pageid
      if (shadow){
        for (const pageid in shadow) {
          grouped[shadow[pageid]] = pageid
        }
      }
    }
    for (const itemid in grouped) {
      const pageid = grouped[itemid]
      designVm.$store.commit('setDesignItemValue', {
        pageid,
        itemid,
        props: {
          grouped: isGrouped ? grouped : undefined
        },
        needSyncShadown: false
      })
    }
  },
  saveJwt (jwt) {
    window.sessionStorage.setItem('jwt', jwt)
  },
  getJwt () {
    return window.sessionStorage.getItem('jwt')
  },
  saveDesign (api, design, cb: any = null) {
    const jwt = this.getJwt()
    if (!design.pages || design.pages.length === 0) return
    // console.log(design)
    const files = {}
    let fileCount = 0
    const promises: any = []
    for (const pageindex in design.pages) {
      const page = design.pages[pageindex]
      const node = $(`#${page.id} .scaled-content`).get(0)
      if (!node) continue
      promises.push(domtoimage.toBlob(node))
    }

    new Promise((resolve) => {
      if (promises.length === 0) {
        resolve()
        return
      }
      for (let pageindex = 0; pageindex < promises.length; pageindex++) {
        promises[pageindex].then(blob => {
          files[`preview_url[${pageindex}]`] = new File([blob], `preview-${pageindex}.png`)
          fileCount++
          if (fileCount >= design.pages.length) {
            resolve()
          }
        }).catch(err => {
          console.error('domtoimage oops, something went wrong!', err)
          fileCount++
          if (fileCount >= design.pages.length) {
            resolve()
          }
        })
      }
    }).then((blobs) => {
      // console.log(files)
      this.post(api + 'design/save.json', { meta: JSON.stringify(design) }, files, (rst) => {
        if (cb) {
          cb(rst)
        }
        if (!rst || !rst.success) {
          this.toast('保存失败', rst.msg || '自动保存失败')
        }
      }, 'json')
    })
  },
  toast (title, msg) {
    const dialogId = this.uuid(8, 16, 'tst')
    $('body').append(`<div class=" d-flex justify-content-center align-items-center">
    <div class="toast" role="alert" data-delay="3000" id="${dialogId}" aria-live="assertive" aria-atomic="true" style="position: absolute; top: 10px; right: 10px;z-index:1051;opacity:1">
    <div class="toast-header">
    <img src="/img/logo.png" class="rounded mr-2" style="height: 16px">
    <strong class="mr-auto">${title}</strong>
    <button type="button" class="ml-2 mb-1 close no-outline" data-dismiss="toast" aria-label="Close">
    <span aria-hidden="true">&times;</span>
    </button>
    </div>
    <div class="toast-body">
      ${msg}
    </div>
    </div></div>`)
    $(`#${dialogId}`).toast('show')
  },
  closeDialog (dialogId) {
    $(`#${dialogId}`).modal('hide')
    $(`#${dialogId}`).remove()
    delete window[dialogId + 'okCb']
  },
  loading (content, dialogId = '') {
    if (!dialogId) dialogId = this.uuid(8, 16, 'dlg')
    const loadingCb = function () {
      $(`#${dialogId}`).modal('hide')
    }
    window[dialogId + 'okCb'] = loadingCb
    $('body').append(`
    <div class="modal  no-user-select" tabindex="-1" data-backdrop="static" role="dialog" id="${dialogId}">
      <div class="modal-dialog modal-sm modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-body text-center">
            <div class="text-center m-3 text-white text-muted">${content}</div>
            <div class="progress">
              <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar"
                   aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="width: 100%"></div>
            </div>
          </div>
        </div>
      </div>
    </div>`)
    $(`#${dialogId}`).modal('show')
    return dialogId
  },
  openDialog (title, content, okText, cancelText = '', okCb: any = null, dialogId = '') {
    if (!dialogId) dialogId = this.uuid(8, 16, 'dlg')
    if (!okCb) {
      okCb = function () {
        $(`#${dialogId}`).modal('hide')
        $(`#${dialogId}`).remove()
      }
    }

    window[dialogId + 'okCb'] = okCb
    $('body').append(`
    <div class="modal" tabindex="-1" role="dialog" id="${dialogId}">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header no-border">
            <h5 class="modal-title ${title ? '' : 'd-none'}">${title}</h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body">
            ${content}
          </div>
          <div class="modal-footer no-border">
            <button type="button" class="btn btn-secondary ${cancelText ? '' : 'd-none'}" data-dismiss="modal">${cancelText}</button>
            <button type="button" class="btn btn-primary" onclick="${dialogId}okCb('${dialogId}')">${okText}</button>
          </div>
        </div>
      </div>
    </div>`)
    $(`#${dialogId}`).modal('show')
    return dialogId
  },
  get (url, data = {}, cb) {
    $.ajax({
      headers: {
        token: this.getJwt()
      },
      url: url,
      data: data,
      crossDomain: true,
      success: (data) => cb(data),
      dataType: 'json'
    })
  },
  post (url, data = {}, files: Record<string, any>, cb) {
    const fd: FormData = new FormData()
    for (const key in data) {
      fd.append(key, data[key])
    }
    for (const file in files) {
      fd.append(file, files[file])
    }
    $.ajax({
      headers: {
        token: this.getJwt()
      },
      method: 'post',
      processData: false,
      contentType: false,
      url: url,
      data: fd,
      crossDomain: true,
      success: (data) => cb(data),
      error: (data) => cb(data),
      dataType: 'json'
    })
  },
  deepMerge (...objs) {
    const result = Object.create(null)
    objs.forEach(obj => {
      if (obj) {
        Object.keys(obj).forEach(key => {
          const val = obj[key]
          if (this.isPlainObject(val)) {
            // 递归
            if (this.isPlainObject(result[key])) {
              result[key] = this.deepMerge(result[key], val)
            } else {
              result[key] = this.deepMerge(val)
            }
          } else {
            result[key] = val
          }
        })
      }
    })
    // console.log(result)
    return result
  },
  isPlainObject (val) {
    return toString.call(val) === '[object Object]'
  },
  /**
   * 切换显示Popper弹出菜单
   *
   * @param vueObject Vue对象，必须有notifyDismissAllMenu方法
   * @param openWhere
   * @param openForm
   * @param trigger
   * @param placement
   * @param offset
   * @param dismissAllMenu
   */
  togglePopper: function (vueObject, openWhere, openForm, trigger, placement: Placement = 'bottom-end', offset = [0, 10], dismissAllMenu = true) {
    const oldState = vueObject[trigger]
    if (dismissAllMenu) vueObject.notifyDismissAllMenu({ trigger })
    vueObject[trigger] = !oldState
    if (!vueObject[trigger]) return
    vueObject.$nextTick(function () {
      const el = this.$refs[openForm].$el || this.$refs[openForm] // 是组件的话，需要用里面的el
      const popper = createPopper(openWhere, el, {
        placement,
        modifiers: [
          {
            name: 'offset',
            options: {
              offset: offset
            }
          }
        ]
      })
    })
  },
  /**
   * 获取当前在屏幕中显示的页面id
   * @return Array<string>
   */
  getPageIdInScreen: function () {
    const clientWidth = document.body.clientWidth
    const clientHeight = document.body.clientHeight
    const pageInScreen: Array<string> = []
    $('.editor').each(function (idx, el) {
      const rect = el.getBoundingClientRect()
      if (rect.bottom <= 83 /* 滚出了workspace区域 */ || rect.right <= 0 || rect.left >= clientWidth || rect.top >= clientHeight) {
        return
      }
      const pageid = $(el).attr('data-page-ref') as string
      pageInScreen.push(pageid)
    })
    return pageInScreen
  },
  /**
   * 判断给定的元素是否完全进入了指定的页面
   * @return boolean
   */
  elementIsInPage (el: HTMLElement | SVGElement, page: HTMLElement) {
    if (!el || !page) return false
    const elRect: DOMRect = el.getBoundingClientRect()
    const pageRect: DOMRect = page.getBoundingClientRect()
    if (elRect.left >= pageRect.left && elRect.right <= pageRect.right && elRect.top >= pageRect.top && elRect.bottom <= pageRect.bottom) {
      return true
    }
    return false
  },
  /**
   * 获取当前在屏幕中显示的，在屏幕中心的页面id, 用页面的y坐标和中心点的y坐标的距离差最小的那个，如果距离屏幕中心的页面有被选中的，则返回选中的
   */
  getPageIdInScreenCenter: function () {
    const clientWidth = document.body.clientWidth
    const clientHeight = document.body.clientHeight
    const screenCenterX = clientWidth / 2
    const screenCenterY = clientHeight / 2
    // console.log(`screen center: ${screenCenterX}x${screenCenterY}`)
    const pageInScreen = {}
    let selected = ''
    let selectedPageDist = 0
    $('.editor').each(function (idx, el) {
      const rect = el.getBoundingClientRect()
      if (rect.bottom <= 83 /* 滚出了workspace区域 */ || rect.right <= 0 || rect.left >= clientWidth || rect.top >= clientHeight) {
        return
      }
      const centerY = rect.height / 2 + rect.top
      const centerX = rect.width / 2 + rect.left
      const dist = Math.sqrt(Math.pow(centerY - screenCenterY, 2) + Math.pow(centerX - screenCenterX, 2))
      const pageid = $(el).attr('data-page-ref') as string
      pageInScreen[dist] = pageid
      if ($(el).hasClass('selected')) {
        selectedPageDist = dist
        selected = pageid
      }
    })
    // console.log(pageInScreen)
    const dists = Object.keys(pageInScreen).sort()
    if (selected) return selected
    return pageInScreen[dists[0]] || ''
  },
  isEmptyObject: function (e) {
    for (const t in e) {
      return !1
    }
    return !0
  },
  /**
   * 按默认2页对页显示，根据页面的顺序计算他所在的对页分组
   * @param pageIndex
   */
  getGroupIndex: function (pageIndex: number) {
    if (pageIndex === 0) return 0 // 首页
    if (pageIndex % 2 === 0) { // 偶数页
      return pageIndex / 2
    } else { // 奇数页
      return pageIndex - (pageIndex - 1) / 2
    }
  },
  formatFloat: function (f) {
    const v = (parseFloat(f) || 0).toFixed(2)
    if (v.match(/\.00/)) {
      return parseInt(v)
    } else {
      return parseFloat(v)
    }
  },
  unitName: function (unit) {
    const map = { px: '像素', mm: '毫米', cm: '厘米', in: '英寸' }
    return map[unit] || unit
  },
  isDragInCorners: function (direction: number[]) {
    return (direction[0] === -1 && direction[1] === -1) || (direction[0] === -1 && direction[1] === 1) ||
      (direction[0] === 1 && direction[1] === 1) || (direction[0] === 1 && direction[1] === -1)
  },
  /**
   * 如果传入assetSide则判断是否拖动指定的边，如果不传入则判断是否拖动任意边
   * @param direction
   * @param assetSide t b l r
   */
  isDragInEdge: function (direction: number[], assertSide = '') {
    if (assertSide === 't') {
      return (direction[0] === 0 && direction[1] === -1)
    }
    if (assertSide === 'r') {
      return (direction[0] === 1 && direction[1] === 0)
    }
    if (assertSide === 'b') {
      return (direction[0] === 0 && direction[1] === 1)
    }
    if (assertSide === 'l') {
      return (direction[0] === -1 && direction[1] === 0)
    }
    return (direction[0] === 1 && direction[1] === 0) || (direction[0] === 0 && direction[1] === 1) ||
      (direction[0] === -1 && direction[1] === 0) || (direction[0] === 0 && direction[1] === -1)
  },
  /**
   * TODO 该函数为什么不通过computed来实现呢？
   * @param el
   * @param frame
   */
  applyFrameCSS: function (el: any, frame: Frame) {
    if (el) {
      // console.log('applyFrameCSS ' + frame.toCSS())
      // const el: any = moveable.target
      el.style.cssText = frame.toCSS()
    }
  },
  getTransform (el: HTMLElement): Frame {
    const json: any = {
      // left: 'left',
      // top: 'top',
      // width: '',
      // height: '',
      transform: {
      //   translateX: '0px',
      //   translateY: '0px',
      //   rotate: '0deg',
      //   rotateY: '0deg',
      //   rotateX: '0deg',
      //   scaleX: 1,
      //   scaleY: 1,
      //   matrix3d: undefined
      }
    }
    const transform = el.style?.transform
    let items: any
    if ((items = transform.match(/translateX\(-?\d*(\.\d+)?px\)/ig))) {
      json.transform.translateX = this.formatFloat(items[0].replace(/translateX\(|px\)/g, '')) + 'px'
    }

    if ((items = transform.match(/translateY\(-?\d*(\.\d+)?px\)/ig))) {
      json.transform.translateY = parseFloat(items[0].replace(/translateY\(|px\)/g, '')) + 'px'
    }

    if ((items = transform.match(/rotate\(-?\d+(\.\d+)?deg\)/ig))) {
      json.transform.rotate = parseFloat(items[0].replace(/rotate\(|deg\)/g, '')) + 'deg'
    }

    if ((items = transform.match(/rotateX\(-?\d+(\.\d+)?deg\)/ig))) {
      json.transform.rotateX = parseFloat(items[0].replace(/rotateX\(|deg\)/g, '')) + 'deg'
    }

    if ((items = transform.match(/rotateY\(-?\d+(\.\d+)?deg\)/ig))) {
      json.transform.rotateY = parseFloat(items[0].replace(/rotateY\(|deg\)/g, '')) + 'deg'
    }

    if ((items = transform.match(/scaleX\(-?\d*(\.\d+)?\)/ig))) {
      json.transform.scaleX = parseFloat(items[0].replace(/scaleX\(|\)/g, ''))
    }

    if ((items = transform.match(/scaleY\(-?\d*(\.\d+)?\)/ig))) {
      json.transform.scaleY = parseFloat(items[0].replace(/scaleY\(|\)/g, ''))
    }

    if ((items = transform.match(/matrix3d\(.+\)/ig))) {
      json.transform.matrix3d = items[0].replace(/matrix3d\(|\)/g, '')
    } else {
      delete json.transform.matrix3d
    }

    // console.log(el.style.width)
    json.width = $(el).width() + 'px'
    json.height = $(el).height() + 'px'
    json.top = el.style?.top
    json.left = el.style?.left
    return new Frame(json)
  },
  log: (msg) => {
    if ($('#log-console').length === 0) {
      $('body').append("<div id='log-console'></div>")
    }
    $('#log-console').append('<p>' + JSON.stringify(msg) + '</p>')
  },
  /**
   *
   * @param {type} len 长度
   * @param {type} radix 进制
   * @returns {String}
   */
  uuid: (len, radix, prefix = '') => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')
    radix = radix || chars.length
    const uuid: any = []
    if (len) {
    // Compact form
      for (let i = 0; i < len; i++) { uuid[i] = chars[0 | Math.random() * radix] }
    } else {
    // rfc4122, version 4 form
      let r
      // rfc4122 requires these characters
      uuid[8] = uuid[13] = uuid[18] = uuid[23] = '-'
      uuid[14] = '4'
      // Fill in random data. At i==19 set the high bits of clock sequence as
      // per rfc4122, sec. 4.1.5
      for (let i = 0; i < 36; i++) {
        if (!uuid[i]) {
          r = 0 | Math.random() * 16
          uuid[i] = chars[(i === 19) ? (r & 0x3) | 0x8 : r]
        }
      }
    }

    return (prefix || '') + uuid.join('')
  }
}
