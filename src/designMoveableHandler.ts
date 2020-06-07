import Moveable, { MoveableOptions, OnResize, OnResizeStart, OnScale, OnScaleStart, OnSnap } from 'moveable'
import { Frame } from 'scenejs'
import $ from 'jquery'
import utils from '@/utils.ts'
import { Instance } from '@popperjs/core/lib/types'
import { createPopper } from '@popperjs/core'
import { OnDragEnd } from 'react-moveable/src/react-moveable/types'
/**
 * 负责设计器中的moveable处理代码
 */
class DesignMoveableHandler {
  private moveable: Moveable
  private currentPageMoveable: Moveable
  private moveableFrames: Record<string, Frame>
  private designVm: any
  private labelElement: HTMLElement
  private isPinchStart = false
  private quickSidebar: Instance|null
  private hasRender = false

  constructor (vm: any) {
    this.designVm = vm
    this.labelElement = vm.$refs.label
    this.quickSidebar = null
    this.moveableFrames = {}
    this.currentPageMoveable = new Moveable(vm.$refs.workspace, {
      container: vm.$refs.workspace,
      draggable: false,
      resizable: false,
      rotatable: false,
      warpable: false,
      snappable: false,
      snapCenter: false,
      baseDirection: [],
      pinchable: false,
      origin: false,
      keepRatio: false,
      edge: false,
      throttleResize: 1
    })
    this.moveable = new Moveable(vm.$refs.workspace, {
      bounds: {},
      target: [],
      container: vm.$refs.workspace,
      draggable: true,
      resizable: true,
      rotatable: true,
      warpable: false,
      snappable: true,
      snapCenter: true,
      pinchable: true, // ['resizable', 'scalable', 'rotatable'],
      origin: false, // 中心点
      keepRatio: false,
      // Resize, Scale Events at edges.
      edge: false,
      throttleDrag: 0,
      throttleResize: 0,
      throttleScale: 0,
      throttleRotate: 1
    })
    this.initMoveable()
    this.initGroupMoveable()
  }

  public getMoveable () {
    return this.moveable
  }

  public getCurrentPageMoveable () {
    return this.currentPageMoveable
  }

  public getMoveableFrames () {
    return this.moveableFrames
  }

  public setTargets (targets: Array<HTMLElement>) {
    this.moveable.target = [...targets]
  }

  /**
   * 更新当前选择元素和页面的选择框，如果传入needFit = true 那么会让页面适应屏幕
   */
  public updateMoveableRect (needFit) {
    const designVm = this.designVm
    designVm.$nextTick(function () {
      // this 是designVm
      this.pageMoveable.updateRect()
      this.moveable.updateRect()
      if (designVm.fitOrFill && needFit) {
        designVm.changeZoomPercent(designVm.fitOrFill)
      }
    })
  }

  /**
   * 点击元素后更新编辑元素参考线（初始化屏幕中心线和画的参考线以及分栏参考线）
   * @param moveable
   */
  public refreshGuidelines () {
    const designVm = this.designVm
    // console.log(designVm.$refs.ruler.getVerticalGuides())
    this.moveable.verticalGuidelines = [...designVm.$refs.ruler.getVerticalGuides()]
    this.moveable.horizontalGuidelines = [...designVm.$refs.ruler.getHorizontalGuides()]
  }

  /**
   * 标记一个元素为可以编辑状态，构建其frame和刷新其参考尺拖出的参考线
   **/
  public updateMoveable (pageid, itemId) {
    const designVm = this.designVm
    const el: any = $('#' + itemId).get(0)
    // 如果stroe中该元素已经有计算好的frame，则用之，没有（第一次添加）时则通过浏览器渲染后的元素进行计算
    const pageindex = designVm.$store.getters.findPageIndex(pageid)
    const frameJson = designVm.$store.getters.getDesignItemValue(pageindex, itemId, 'frame')
    // 编辑状态的frmae和store中的store合并，在某些情况下，只会更新store中的部分信息，比如联动编辑模式下修改图片的镜像等
    // 而实际编辑时以渲染出来的dom为主
    const liveFrame: Frame = new Frame(frameJson.item)
    liveFrame.merge(utils.getTransform(el))
    if (!this.moveableFrames[itemId]) {
      this.moveableFrames[itemId] = new Frame()
    }
    // console.log(frameJson)
    // moveableFrame是所有设计元素共用的，所有当改变设计元素是，需要把之前的style删除，才merge，不重新赋值用merge的目的是保存moveableFrame的引用不变
    this.moveableFrames[itemId].merge(new Frame({ left: '', top: '', width: 0, height: 0, transform: { translateX: '0px', translateY: '0px', rotate: '0deg', scaleX: '1', scaleY: '1' } }))
    this.moveableFrames[itemId].merge(liveFrame)
    // console.log(moveableFrame.toCSS())
    // 主要设置一些中心参考先，对于元素之间的边线参考线在DesignPage中进行设置
    this.refreshGuidelines()
  }

  /**
   * 向Store中更新元素的frame
   */
  private commitItemFrame () {
    const designVm = this.designVm
    // 更新item的frame
    designVm.$nextTick(() => {
      if (!designVm.selectedItems) return
      for (const itemid in designVm.selectedItems) {
        // console.log(this.moveableFrames[itemid].toCSSObject())

        designVm.$store.dispatch('setDesignItemValue', {
          pageid: designVm.selectedItems[itemid].pageid,
          itemid: itemid,
          props: {
            frame: {
              item: this.moveableFrames[itemid].toCSSObject()
            }
          }
        })
      }
    })
  }

  private move (itemid: string, translate: number[]) {
    this.moveableFrames[itemid].set('transform', 'translateX', `${translate[0]}px`)
    this.moveableFrames[itemid].set('transform', 'translateY', `${translate[1]}px`)
  }

  /**
   * 在元素el旁边显示快捷菜单
   */
  public showQuickActionbar (el) {
    const designVm = this.designVm
    if (!designVm.$refs.quickActionBar) return
    this.quickSidebar = createPopper(el, designVm.$refs.quickActionBar.$el, {
      placement: 'right-start',
      modifiers: [
        {
          name: 'offset',
          options: {
            offset: [0, 30]
          }
        }
      ]
    })
  }

  /**
   * 在对页模式时，判断指定的元素是否应该在其他分组页面中生产影子（该元素的边界已经进入其他页面了）
   * 如果应该产生影子，则在对应的页面中创建影子
   * 创建影子时，是直接把源（现在正在交互的元素）copy 到目标页面，这时源的位移是相对于源所在页面的
   * 目标页面的元素需要进行调整，确保源和目标重叠，由于是水平对页，所以偏移y是一样的，目标的偏移X刚好是
   * 源和目标之间的页面距离，该偏移XY会记录在元素的itemOffset中，元素自己要watch该属性对自己内部的所有是
   * 现对于页面的XY重新进行调整（在copy后的xy中加上itemOffset）
   */
  private shadowHandleWhenRender (sourceEl: HTMLElement | SVGElement) {
    const itemId: any = $(sourceEl).attr('id')
    const sourcePageId: any = $(sourceEl).attr('data-page-ref')
    const designVm = this.designVm
    const sourcePageIndex = designVm.$store.getters.findPageIndex(sourcePageId)
    const currItem = designVm.$store.getters.getDesignItem(sourcePageIndex, itemId)
    if (!currItem) return
    const shadow = currItem.shadow

    // 增加处理元素移到另一个页面的情况，如果完全进入另一个页面，则把元素整体移动过去
    const screenPages = utils.getPageIdInScreen()
    for (const screenPageId of screenPages) {
      if (shadow && shadow[screenPageId]) continue
      if (screenPageId === sourcePageId) continue
      if (utils.elementIsInPage(sourceEl, $(`.blood-area[data-page-ref='${screenPageId}']`).get(0))) {
        console.log(`move in page ${screenPageId}`)
        designVm.$store.dispatch('moveItemToPage', { sourcePageId: sourcePageId, sourceItemId: itemId, toPageId: screenPageId })
      }
    }

    if (!this.designVm.isDoublePageLayout) return

    // 对组下面做影子处理 直接通过dom查找同组下每个页面的边界, pageid:{left: right:}
    const pageEdges: Record<string, DOMRect> = {}
    $(sourceEl).parents('.page-group').find('.blood-area').each(function (idx, page) {
      const pageid = $(page).attr('data-page-ref') as string
      const rect = page.getBoundingClientRect()
      pageEdges[pageid] = rect
    })

    if (utils.isEmptyObject(pageEdges)) return

    const sourceRect = sourceEl.getBoundingClientRect()
    for (const pageid in pageEdges) {
      const pageLeft = pageEdges[pageid].left
      const pageRight = pageEdges[pageid].right
      // 进入了部分
      if ((sourceRect.left < pageLeft && sourceRect.right > pageLeft) || (sourceRect.left < pageRight && sourceRect.right > pageRight)) {
        // console.log(` enter in ${pageid}`)
        if (shadow[pageid] || sourcePageId === pageid) continue
        // console.log(' addShadowItemInPage')
        designVm.$store.dispatch('addShadowItemInPage', {
          groupPageEdges: pageEdges,
          sourcePageId: sourcePageId,
          sourceItemId: itemId,
          sourceItemEl: sourceEl,
          enterPageId: pageid
        })
      }
      // 完全移除了页面: 离开了原来的页面或者离开了所在的影子页面
      if ((shadow[pageid] || pageid === sourcePageId) && (pageLeft > sourceRect.right || pageRight < sourceRect.left)) {
        // console.log(`(${shadow[pageid]} || ${pageid} === ${sourcePageId}) && (${pageLeft} > ${sourceRect.right} || ${pageRight} < ${sourceRect.left})`)
        // console.log(` not in ${pageid} removeShadowItemInPage`)
        designVm.$store.dispatch('removeShadowItemInPage', { sourcePageId: sourcePageId, sourceItemId: itemId, leavePageId: pageid })
      }
    }

    if (utils.isEmptyObject(shadow)) return // 未产生影子

    designVm.$store.dispatch('syncShadowFrame', {
      sourcePageId: sourcePageId,
      sourceItemEl: sourceEl,
      sourceItemId: itemId,
      groupPageEdges: pageEdges
    })
    // console.log(pageEdges)
  }

  /**
   * 事件通知到当前选中的元素及其影子（通知到DesignPage在通知到设计元素）
   */
  private dispatchMoveableEvent (eventName, event: any) {
    const designVm = this.designVm
    const itemId: any = $(event.target).attr('id')
    const pageRef: any = $(event.target).attr('data-page-ref')
    // console.log(`dispatchMoveableEvent ${pageRef} ${itemId}`)
    if (designVm.$refs[pageRef]) {
      designVm.$refs[pageRef][0].$emit(eventName, itemId, event)
    }
  }

  private updateLabel (text) {
    this.labelElement.innerHTML = text
  }

  private updateLabelCSS (clientX: number, clientY: number) {
    this.labelElement.style.cssText = `display: block; transform: translate(${clientX}px, ${clientY - 10}px) translate(-100%, -100%);`
  }

  private hideLabel () {
    this.labelElement.style.display = 'none'
  }

  /**
   * 初始化moveable的各项事件
   */
  private initMoveable () {
    const designVm = this.designVm
    /* draggable */
    this.moveable.on('dragStart', (dragStart) => {
      const itemid = $(dragStart.target).attr('id') as string
      // console.log(`dragStart ${itemid}`)
      dragStart.set([
        parseFloat(this.moveableFrames[itemid].get('transform', 'translateX')),
        parseFloat(this.moveableFrames[itemid].get('transform', 'translateY'))
      ])
      this.dispatchMoveableEvent('dragStart', dragStart)
    }).on('drag', (drag) => {
      const itemid = $(drag.target).attr('id') as string
      // console.log(`drag ${itemid}`)
      this.move(itemid, drag.beforeTranslate)
      this.dispatchMoveableEvent('drag', drag)
    }).on('dragEnd', (dragEnd) => {
      // console.log('onDragEnd')
      this.dispatchMoveableEvent('dragEnd', dragEnd)
    })

    // resize
    this.moveable.on('resizeStart', (resizeStart: OnResizeStart) => {
      // console.log('resizeStart', target)
      const itemid = $(resizeStart.target).attr('id') as string
      // 正常的resize
      resizeStart.setOrigin(['%', '%'])
      resizeStart.dragStart && resizeStart.dragStart.set([
        parseFloat(this.moveableFrames[itemid].get('transform', 'translateX')),
        parseFloat(this.moveableFrames[itemid].get('transform', 'translateY'))
      ])
      this.dispatchMoveableEvent('resizeStart', resizeStart)
    }).on('resize', (resizeEvent: OnResize) => {
      const itemid = $(resizeEvent.target).attr('id') as string
      this.moveableFrames[itemid].set('width', `${resizeEvent.width}px`)
      this.moveableFrames[itemid].set('height', `${resizeEvent.height}px`)
      this.move(itemid, resizeEvent.drag.beforeTranslate)
      if (!resizeEvent.isPinch) {
        this.updateLabelCSS(resizeEvent.clientX, resizeEvent.clientY)
        this.updateLabel(`${resizeEvent.width} X ${resizeEvent.height}`)
      }
      this.dispatchMoveableEvent('resize', resizeEvent)
    }).on('resizeEnd', (resizeEndEvent) => {
      // console.log('onResizeEnd', target, isDrag)
      this.dispatchMoveableEvent('resizeEnd', resizeEndEvent)
    })

    // scale
    this.moveable.on('scaleStart', (scaleStartEvent) => {
      // console.log('onScaleStart', target)
      const itemid = $(scaleStartEvent.target).attr('id') as string
      this.dispatchMoveableEvent('scaleStart', scaleStartEvent)
      scaleStartEvent.set([
        parseFloat(this.moveableFrames[itemid].get('transform', 'scaleX')),
        parseFloat(this.moveableFrames[itemid].get('transform', 'scaleY'))
      ])
      // If a drag event has already occurred, there is no dragStart.
      scaleStartEvent.dragStart && scaleStartEvent.dragStart.set([
        parseFloat(this.moveableFrames[itemid].get('transform', 'translateX')),
        parseFloat(this.moveableFrames[itemid].get('transform', 'translateY'))
      ])
    }).on('scale', (scaleEvent: OnScale) => {
      const itemid = $(scaleEvent.target).attr('id') as string
      // console.log('onScale scale', scaleEvent)
      this.moveableFrames[itemid].set('transform', 'scaleX', scaleEvent.scale[0])
      this.moveableFrames[itemid].set('transform', 'scaleY', scaleEvent.scale[1])
      this.move(itemid, scaleEvent.drag.beforeTranslate)

      this.dispatchMoveableEvent('scale', scaleEvent)
    }).on('scaleEnd', (scaleEndEvent) => {
      this.dispatchMoveableEvent('scaleEnd', scaleEndEvent)
    })

    // rotate
    this.moveable.on('rotateStart', (rotateStartEvent) => {
      const itemid = $(rotateStartEvent.target).attr('id') as string
      rotateStartEvent.set(parseFloat(this.moveableFrames[itemid].get('transform', 'rotate')))
      this.dispatchMoveableEvent('rotateStart', rotateStartEvent)
    }).on('rotate', (rotateEvent) => {
      // console.log(`${-rotateEvent.beforeRotate}deg`)
      const itemid = $(rotateEvent.target).attr('id') as string
      this.moveableFrames[itemid].set('transform', 'rotate', `${rotateEvent.beforeRotate}deg`)
      if (!rotateEvent.isPinch) {
        this.updateLabelCSS(rotateEvent.clientX, rotateEvent.clientY)
        this.updateLabel(`${rotateEvent.beforeRotate}°`)
      }
      this.dispatchMoveableEvent('rotate', rotateEvent)
    }).on('rotateEnd', (rotateEndEvent) => {
      this.dispatchMoveableEvent('rotateEnd', rotateEndEvent)
    })

    // pinch
    this.moveable.on('pinchStart', (pinchStartEvent) => {
      this.isPinchStart = true
      // console.log('pinchStart')
      this.dispatchMoveableEvent('pinchStart', pinchStartEvent)
    }).on('pinch', (pinchEvent) => {
      this.updateLabelCSS(pinchEvent.clientX, pinchEvent.clientY)
      this.dispatchMoveableEvent('pinch', pinchEvent)
    }).on('pinchEnd', (pinchEndEvent) => {
      // pinchEnd event occur before dragEnd, rotateEnd, scaleEnd, resizeEnd
      // console.log('onPinchEnd')
      this.dispatchMoveableEvent('pinchEnd', pinchEndEvent)
    })

    // render
    this.moveable.on('renderStart', (renderStart) => {
      // console.log('renderStart')
      this.showQuickActionbar(renderStart.target) // 点击元素时先把quick popper构建出来
      this.dispatchMoveableEvent('renderStart', renderStart)
    }).on('render', (renderEvent) => {
      // console.log('render')
      this.hasRender = true
      const itemid = $(renderEvent.target).attr('id') as string
      if (this.isPinchStart) {
        this.updateLabel(`W: ${parseFloat(this.moveableFrames[itemid].get('width'))}<br/> H: ${parseFloat(this.moveableFrames[itemid].get('height'))}<br/> R: ${parseFloat(this.moveableFrames[itemid].get('transform', 'rotate'))}°`)
      }
      // console.log(this.moveableFrames[itemid].toCSS())
      utils.applyFrameCSS(renderEvent.target, this.moveableFrames[itemid])
      designVm.quickActionbarVisiable = false
      this.commitItemFrame()
      this.dispatchMoveableEvent('render', renderEvent)
      this.shadowHandleWhenRender(renderEvent.target) // 在把拖动的元素的内部Frame计算完后调用

      // 把吸附的边框效果清除
      $('.snaped').removeClass('snaped')
    }).on('renderEnd', (renderEnd) => {
      // console.log('renderEnd')
      this.isPinchStart = false
      this.hideLabel()
      this.moveable.keepRatio = false
      designVm.quickActionbarVisiable = true
      this.dispatchMoveableEvent('renderEnd', renderEnd)
      designVm.$nextTick(() => {
        if (this.quickSidebar) this.quickSidebar.update()
      })
      // 把吸附的边框效果清除
      $('.snaped').removeClass('snaped')
      if (this.hasRender) designVm.$store.commit('saveUndoState')
      this.hasRender = false
    })

    // warp
    this.moveable.on('warpStart', (warpStart) => {
      this.dispatchMoveableEvent('warpStart', warpStart)
    }).on('warp', (warpEvent) => {
      const itemid = $(warpEvent.target).attr('id') as string
      // target.style.transform = transform;
      const pageindex = designVm.findPageIndex(itemid)
      let matrix = designVm.getDesignItemValue(pageindex, itemid, 'matrix')
      matrix = warpEvent.multiply(matrix, warpEvent.delta)
      // console.log('onWarp', matrix.join(','))
      // target.style.transform =
      this.moveableFrames[itemid].set('transform', 'matrix3d', `${matrix.join(',')}`)
      this.dispatchMoveableEvent('warp', warpEvent)
    }).on('warpEnd', (warpEndEvent) => {
      // console.log('onWarpEnd', target, isDrag)
      this.dispatchMoveableEvent('warpEnd', warpEndEvent)
    })

    // https://github.com/daybrush/moveable/issues/204
    this.moveable.on('snap', e => {
      if (e.elements.length === 0) return
      // console.log(snap.elements)
      for (let i = 0; i < e.elements.length; i++) {
        for (let j = 0; j < e.elements[i].length; j++) {
          const el = e.elements[i][j].element as HTMLElement
          // console.log(el)
          if ($(el).hasClass('safe-area') || $(el).hasClass('layout-column')) {
            $(el).addClass('snaped')
          }
        }
      }
    })
  }

  /**
   * 初始化一组group moveable的各项事件
   */
  private initGroupMoveable () {
    const designVm = this.designVm
    /* draggable */
    this.moveable.on('dragGroupStart', ({ events }) => {
      events.forEach((dragStart, i) => {
        const itemid = $(dragStart.target).attr('id') as string
        // console.log(`dragStart ${itemid}`)
        dragStart.set([
          parseFloat(this.moveableFrames[itemid].get('transform', 'translateX')),
          parseFloat(this.moveableFrames[itemid].get('transform', 'translateY'))
        ])
        this.dispatchMoveableEvent('dragStart', dragStart)
      })
    }).on('dragGroup', ({ events }) => {
      events.forEach(({ target, beforeTranslate }, i) => {
        const itemid = $(target).attr('id') as string
        // console.log(`drag ${itemid}`, beforeTranslate)
        this.move(itemid, beforeTranslate)
        this.dispatchMoveableEvent('drag', events[i])
      })
    }).on('dragGroupEnd', (dragGroupEnd) => {
      // console.log('onDragEnd')
      dragGroupEnd.targets.forEach((target) => {
        dragGroupEnd.target = target
        this.dispatchMoveableEvent('dragEnd', dragGroupEnd)
      })
    })

    // resize
    this.moveable.on('resizeGroupStart', ({ events }) => {
      // console.log('resizeStart', target)
      events.forEach((resizeStart, i) => {
        const itemid = $(resizeStart.target).attr('id') as string
        // 正常的resize
        resizeStart.setOrigin(['%', '%'])
        resizeStart.dragStart && resizeStart.dragStart.set([
          parseFloat(this.moveableFrames[itemid].get('transform', 'translateX')),
          parseFloat(this.moveableFrames[itemid].get('transform', 'translateY'))
        ])
        this.dispatchMoveableEvent('resizeStart', resizeStart)
      })
    }).on('resizeGroup', ({ events }) => {
      events.forEach((resizeEvent, i) => {
        const itemid = $(resizeEvent.target).attr('id') as string
        this.moveableFrames[itemid].set('width', `${resizeEvent.width}px`)
        this.moveableFrames[itemid].set('height', `${resizeEvent.height}px`)
        this.move(itemid, resizeEvent.drag.beforeTranslate)
        if (!resizeEvent.isPinch) {
          this.updateLabelCSS(resizeEvent.clientX, resizeEvent.clientY)
          this.updateLabel(`${resizeEvent.width} X ${resizeEvent.height}`)
        }
        this.dispatchMoveableEvent('resize', resizeEvent)
      })
    }).on('resizeGroupEnd', (resizeEndEvent) => {
      // console.log('onResizeEnd', target, isDrag)
      resizeEndEvent.targets.forEach((target, i) => {
        resizeEndEvent.target = target
        this.dispatchMoveableEvent('resizeEnd', resizeEndEvent)
      })
    })

    // scale
    this.moveable.on('scaleGroupStart', ({ events }) => {
      // console.log('onScaleStart', target)
      events.forEach((scaleStartEvent, i) => {
        const itemid = $(scaleStartEvent.target).attr('id') as string
        this.dispatchMoveableEvent('scaleStart', scaleStartEvent)
        scaleStartEvent.set([
          parseFloat(this.moveableFrames[itemid].get('transform', 'scaleX')),
          parseFloat(this.moveableFrames[itemid].get('transform', 'scaleY'))
        ])
        // If a drag event has already occurred, there is no dragStart.
        scaleStartEvent.dragStart && scaleStartEvent.dragStart.set([
          parseFloat(this.moveableFrames[itemid].get('transform', 'translateX')),
          parseFloat(this.moveableFrames[itemid].get('transform', 'translateY'))
        ])
      })
    }).on('scaleGroup', ({ events }) => {
      events.forEach((scaleEvent, i) => {
        const itemid = $(scaleEvent.target).attr('id') as string
        // console.log('onScale scale', scaleEvent)
        this.moveableFrames[itemid].set('transform', 'scaleX', scaleEvent.scale[0])
        this.moveableFrames[itemid].set('transform', 'scaleY', scaleEvent.scale[1])
        this.move(itemid, scaleEvent.drag.beforeTranslate)

        this.dispatchMoveableEvent('scale', scaleEvent)
      })
    }).on('scaleGroupEnd', (scaleEndEvent) => {
      scaleEndEvent.targets.forEach((target, i) => {
        scaleEndEvent.target = target
        this.dispatchMoveableEvent('scaleEnd', scaleEndEvent)
      })
    })

    // rotate
    this.moveable.on('rotateGroupStart', ({ events }) => {
      events.forEach((rotateStartEvent, i) => {
        const itemid = $(rotateStartEvent.target).attr('id') as string
        rotateStartEvent.set(parseFloat(this.moveableFrames[itemid].get('transform', 'rotate')))
        this.dispatchMoveableEvent('rotateStart', rotateStartEvent)
      })
    }).on('rotateGroup', ({ events }) => {
      events.forEach((rotateEvent, i) => {
        // console.log(`${-rotateEvent.beforeRotate}deg`)
        const itemid = $(rotateEvent.target).attr('id') as string
        this.moveableFrames[itemid].set('transform', 'rotate', `${rotateEvent.beforeRotate}deg`)
        if (!rotateEvent.isPinch) {
          this.updateLabelCSS(rotateEvent.clientX, rotateEvent.clientY)
          this.updateLabel(`${rotateEvent.beforeRotate}°`)
        }
        this.dispatchMoveableEvent('rotate', rotateEvent)
      })
    }).on('rotateGroupEnd', (rotateEndEvent) => {
      rotateEndEvent.targets.forEach((target) => {
        rotateEndEvent.target = target
        this.dispatchMoveableEvent('rotateEnd', rotateEndEvent)
      })
    })

    // pinch
    this.moveable.on('pinchGroupStart', (pinchStartEvent) => {
      this.isPinchStart = true
      // console.log('pinchStart')
      pinchStartEvent.targets.forEach((target) => {
        pinchStartEvent.target = target
        this.dispatchMoveableEvent('pinchStart', pinchStartEvent)
      })
    }).on('pinchGroup', (pinchEvent) => {
      this.updateLabelCSS(pinchEvent.clientX, pinchEvent.clientY)
      pinchEvent.targets.forEach((target) => {
        pinchEvent.target = target
        this.dispatchMoveableEvent('pinch', pinchEvent)
      })
    }).on('pinchGroupEnd', (pinchEndEvent) => {
      // pinchEnd event occur before dragEnd, rotateEnd, scaleEnd, resizeEnd
      // console.log('onPinchEnd')
      pinchEndEvent.targets.forEach((target) => {
        pinchEndEvent.target = target
        this.dispatchMoveableEvent('pinchEnd', pinchEndEvent)
      })
    })

    // render
    this.moveable.on('renderGroupStart', (renderGroupStart) => {
      this.showQuickActionbar(renderGroupStart.target) // 点击元素时先把quick popper构建出来
      // console.log('renderGroupStart')
      renderGroupStart.targets.forEach((target, i) => {
        this.showQuickActionbar(target) // 点击元素时先把quick popper构建出来
        renderGroupStart.target = target
        this.dispatchMoveableEvent('renderStart', renderGroupStart)
      })
    }).on('renderGroup', (renderGroup) => {
      designVm.quickActionbarVisiable = false
      this.hasRender = true
      this.commitItemFrame()
      // 把吸附的边框效果清除
      $('.snaped').removeClass('snaped')
      renderGroup.targets.forEach((target, i) => {
        const itemid = $(target).attr('id') as string
        if (this.isPinchStart) {
          this.updateLabel(`W: ${parseFloat(this.moveableFrames[itemid].get('width'))}<br/> H: ${parseFloat(this.moveableFrames[itemid].get('height'))}<br/> R: ${parseFloat(this.moveableFrames[itemid].get('transform', 'rotate'))}°`)
        }
        // console.log(this.moveableFrames[itemid].toCSS())
        utils.applyFrameCSS(target, this.moveableFrames[itemid])

        renderGroup.target = target
        this.dispatchMoveableEvent('render', renderGroup)
        this.shadowHandleWhenRender(target) // 在把拖动的元素的内部Frame计算完后调用
      })
    }).on('renderGroupEnd', (renderGroupEnd) => {
      // console.log('renderEnd')
      this.isPinchStart = false
      this.hideLabel()
      this.moveable.keepRatio = false
      designVm.quickActionbarVisiable = true
      renderGroupEnd.targets.forEach((target, i) => {
        renderGroupEnd.target = target
        this.dispatchMoveableEvent('renderEnd', renderGroupEnd)
      })
      designVm.$nextTick(() => {
        if (this.quickSidebar) this.quickSidebar.update()
      })
      // 把吸附的边框效果清除
      $('.snaped').removeClass('snaped')
      if(this.hasRender) designVm.$store.commit('saveUndoState')
      this.hasRender = false
    })
  }
}

export default DesignMoveableHandler
