const electron = require('electron')
const { BrowserWindow, BrowserView } = electron
const path = require('path')
const { hash } = require('eth-ens-namehash')
const pixels = require('get-pixels')

const store = require('../../store')

const dev = process.env.NODE_ENV === 'development'

const ghostZ = '#cdcde5'

const topRight = (window) => {
  // pinArea ||
  const area = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint()).workArea
  const screenSize = area
  const windowSize = window.getSize()
  return {
    x: Math.floor(screenSize.x + screenSize.width - windowSize[0]),
    y: screenSize.y
  }
}

const timeout = ms => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const mode = array => {
  if (array.length === 0) return null
  const modeMap = {}
  let maxEl = array[0]; let maxCount = 1
  for (let i = 0; i < array.length; i++) {
    const el = array[i]
    if (!modeMap[el]) {
      modeMap[el] = 1
    } else {
      modeMap[el]++
    }
    if (modeMap[el] > maxCount) {
      maxEl = el
      maxCount = modeMap[el]
    }
  }
  return maxEl
}

const pixelColor = image => {
  const executor = async (resolve, reject) => {
    pixels(image.toPNG(), 'image/png', (err, pixels) => {
      if (err) return reject(err)
      const colors = []
      const width = pixels.shape[0]
      const height = 37
      const depth = pixels.shape[2]
      const limit = width * depth * height
      for (let step = 0; step <= limit; step += depth) {
        const rgb = []
        for (let dive = 0; dive < depth; dive++) rgb.push(pixels.data[step + dive])
        colors.push(`${rgb[0]}, ${rgb[1]}, ${rgb[2]}`)
      }
      const selectedColor = mode(colors)
      const colorArray = selectedColor.split(', ')
      const color = {
        background: `rgb(${selectedColor})`,
        text: textColor(...colorArray)
      }
      resolve(color)
    })
  }
  return new Promise(executor)
}

const getColor = async (view) => {
  const image = await view.webContents.capturePage()
  // fs.writeFile('test.png', image.toPNG(), (err) => {
  //   if (err) throw err
  // })
  const color = await pixelColor(image)
  return color
}

const textColor = (r, g, b) => { // http://alienryderflex.com/hsp.html
  return Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b)) > 127.5 ? 'black' : 'white'
}

const relayerOverlay = (window) => {
  const { overlay } = window
  window.removeBrowserView(overlay)
  window.addBrowserView(overlay)
}

const openDapp = (window, ens, cb) => {
  
  const { width, height } = window.getBounds()

  console.log("WIDTH AND HEIGHT", width, height)

  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      webviewTag: false,
      sandbox: true,
      defaultEncoding: 'utf-8',
      nativeWindowOpen: true,
      nodeIntegration: false
      // scrollBounce: true
      // navigateOnDragDrop: true
    }
  })
  window.addBrowserView(view)
  view.setBackgroundColor('#0000')
  view.setBounds({ x: 73, y: 0, width: width - 73, height: height - 0 })
  view.setAutoResize({ width: true, height: true })
  view.webContents.loadURL(ens)
  view.webContents.setVisualZoomLevelLimits(1, 3)
  window.removeBrowserView(view)

  view.webContents.on('did-finish-load', () => {
    window.addBrowserView(view)
    relayerOverlay(window)
  })

  return view
}

const surface = {
  openView: (ens, session, windows) => {
    windows.tray.blur()

    let existingWindow
    let dappViews = 0

    Object.keys(windows).forEach(window => {
      if (windows[window].dapp) {
        dappViews++
        if (windows[window].dapp.ens === ens) {
          existingWindow = windows[window]
        }
      }
    })

    if (existingWindow) {
      existingWindow.restore()
      existingWindow.focus()
      return
    }

    const url = `http://${ens}.localhost:8421/?session=${session}`
    const area = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint()).workArea
    const height = area.height - 160
    const maxWidth = Math.floor(height * (16/10))
    const width = area.width - 380 - 80  > maxWidth ? maxWidth : area.width - 380 - 80

    windows[session] = new BrowserWindow({
      session,
      x: 20,
      y: 0,
      width,
      height,
      show: false,
      frame: false,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 9, y: 8 },
      backgroundColor: ghostZ,
      // minimizable: false,
      // maximizable: false,
      // closable: false,
      // backgroundThrottling: false,
      icon: path.join(__dirname, './AppIcon.png'),
      // skipTaskbar: process.platform !== 'linux',
      webPreferences: {
        webviewTag: false,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        disableBlinkFeatures: 'Auxclick',
        enableRemoteModule: false,
        preload: path.resolve(__dirname, '../../../bundle/bridge.js')
      }
    })

    windows[session].dapp = { ens}

    // windows[session].positioner = new Positioner(windows[session])
    const pos = topRight(windows[session]) // windows[session].positioner.calculate('topRight')
    const offset = dappViews * 48
    windows[session].setPosition(pos.x - 380 - offset, pos.y + 80)
    // if (dev) windows[session].openDevTools()
    windows[session].on('closed', () => { delete windows[session] })
    windows[session].loadURL(`file://${__dirname}/../../../bundle/dapp.html`)
    const namehash = hash(ens)

    windows[session].webContents.on('did-finish-load', async () => {
      // windows[session].webContents.openDevTools()
      // const dapp = Object.assign({}, store(`main.dapp.details.${namehash}`))
      // dapp.url = url
      // dapp.ens = ens
      // dapp.namehash = namehash
      windows[session].send('main:dapp', namehash)
      store.setDappOpen(ens, true)
    })
    windows[session].show()
    windows[session].on('closed', () => {
      delete windows[session]
      store.setDappOpen(ens, false)
    })

    // Add Overlay View
    windows[session].overlay = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        webviewTag: false,
        sandbox: true,
        defaultEncoding: 'utf-8',
        nativeWindowOpen: true,
        nodeIntegration: false
        // scrollBounce: true
        // navigateOnDragDrop: true
      }
    })
    windows[session].addBrowserView(windows[session].overlay)
    windows[session].overlay.setBackgroundColor('#0000')
    windows[session].overlay.setBounds({ x: 0, y: 0, width, height: 16 })
    windows[session].overlay.setAutoResize({ width: true })
    windows[session].overlay.webContents.loadURL(`file://${__dirname}/index.html`)
    windows[session].removeBrowserView(windows[session].overlay)
    windows[session].overlay.webContents.on('did-finish-load', () => {
      relayerOverlay(windows[session])
      setTimeout(() => relayerOverlay(windows[session]), 10)
    })
    return
  




    // const loadApp = hidden => {
    //   const view = new BrowserView({
    //     webPreferences: {
    //       contextIsolation: true,
    //       webviewTag: false,
    //       sandbox: true,
    //       defaultEncoding: 'utf-8',
    //       nativeWindowOpen: true,
    //       nodeIntegration: false
    //       // scrollBounce: true
    //       // navigateOnDragDrop: true
    //     }
    //   })
    //   view.setBackgroundColor('#000')
    //   windows[session].setBrowserView(view)
    //   view.setBounds({ x: 68, y: hidden ? height : 0, width: width - 68, height: height - 0 })
    //   view.setAutoResize({ width: true, height: true })
    //   view.webContents.loadURL('https://app.uniswap.org')
    //   view.webContents.showDevTools()
    //   return view
    // }

    // const loadApp = hidden => {
    //   const view = new BrowserView({
    //     webPreferences: {
    //       contextIsolation: true,
    //       webviewTag: false,
    //       sandbox: true,
    //       defaultEncoding: 'utf-8',
    //       nativeWindowOpen: true,
    //       nodeIntegration: false
    //       // scrollBounce: true
    //       // navigateOnDragDrop: true
    //     }
    //   })
    //   view.setBackgroundColor('#000')
    //   windows[session].addBrowserView(view)
    //   view.setBounds({ x: 73, y: hidden ? height : 0, width: width - 73, height: height - 0 })
    //   view.setAutoResize({ width: true, height: true })
    //   view.webContents.loadURL('https://app.uniswap.org')
    //   view.webContents.setVisualZoomLevelLimits(1, 3)
    //   return view
    // }

    // const appOverlay = hidden => {
    //   const view2 = new BrowserView({
    //     webPreferences: {
    //       contextIsolation: true,
    //       webviewTag: false,
    //       sandbox: true,
    //       defaultEncoding: 'utf-8',
    //       nativeWindowOpen: true,
    //       nodeIntegration: false
    //       // scrollBounce: true
    //       // navigateOnDragDrop: true
    //     }
    //   })
    //   // view2.setBackgroundColor('#000')
    //   windows[session].addBrowserView(view2)
    //   view2.setBackgroundColor('#0000')
    //   view2.setBounds({ x: 0, y: 0, width, height: 16 })
    //   view2.setAutoResize({ width: true })
    //   view2.webContents.loadURL(`file://${__dirname}/index.html`)

    //   view2.webContents.on('did-finish-load', () => {
    //     windows[session].removeBrowserView(view2)
    //     windows[session].addBrowserView(view2)
    //     setTimeout(() => {
    //       windows[session].removeBrowserView(view2)
    //       windows[session].addBrowserView(view2)
    //     }, 200)
    //   })  
    //   return view2
    // }

    // const dapp = store(`main.dapp.details.${namehash}`)
    // loadApp()
    // appOverlay()
    // if (dapp.color) return loadApp()

    // // If Frame hasn't collected color data for dapp, do that first
    // let tempView = loadApp(true)
    // tempView.webContents.on('did-finish-load', async () => {
    //   await timeout(200)
    //   const color = await getColor(tempView)
    //   store.updateDapp(namehash, { color })
    //   loadApp()
    //   setTimeout(() => {
    //     // tempView.destroy()
    //     tempView = null
    //   }, 0)
    // })
    // console.log(menu(ens))
    // windows[session].setMenu(menu(ens))
    // Menu.setApplicationMenu(menu(ens))
  },
  open: (window, ens, cb) => {
    openDapp(window, ens, cb)
  }
}

module.exports = surface