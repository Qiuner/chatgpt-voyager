import fs from 'fs';
import { dirname, resolve } from 'path';
import type { PluginOption } from 'vite';

// plugin to remove dev icons from prod build
export function stripDevIcons (isDev: boolean) {
  if (isDev) return null

  return {
    name: 'strip-dev-icons',
    resolveId (source: string) {
      return source === 'virtual-module' ? source : null
    },
    renderStart (outputOptions: any, inputOptions: any) {
      const outDir = outputOptions.dir
      fs.rm(resolve(outDir, 'dev-icon-32.png'), () => console.log(`Deleted dev-icon-32.png from prod build`))
      fs.rm(resolve(outDir, 'dev-icon-128.png'), () => console.log(`Deleted dev-icon-128.png from prod build`))
    }
  }
}

// plugin to support i18n 
export function crxI18n (options: { localize: boolean, src: string }): PluginOption {
  if (!options.localize) return null

  const getJsonFiles = (dir: string): Array<string> => {
    const files = fs.readdirSync(dir, {recursive: true}) as string[]
    return files.filter(file => !!file && file.endsWith('.json'))
  }
  const entry = resolve(__dirname, options.src)
  const localeFiles = getJsonFiles(entry)
  const files = localeFiles.map(file => {
    return {
      id: '',
      fileName: file,
      source: fs.readFileSync(resolve(entry, file))
    }
  })
  return {
    name: 'crx-i18n',
    enforce: 'pre',
    buildStart: {
      order: 'post',
      handler() {
        files.forEach((file) => {
            const refId = this.emitFile({
              type: 'asset',
              source: file.source,
              fileName: '_locales/'+file.fileName
            })
            file.id = refId
        })
      }
    }
  }
}

export function mirrorContentStyleCss(options: { from: string; to: string }): PluginOption {
  return {
    name: 'mirror-content-style-css',
    apply: 'build',
    writeBundle(outputOptions) {
      const outDir = outputOptions.dir
      if (!outDir) return
      const manifestAbs = resolve(outDir, 'manifest.json')
      if (!fs.existsSync(manifestAbs)) return

      let manifest: any
      try {
        manifest = JSON.parse(fs.readFileSync(manifestAbs, 'utf8'))
      } catch {
        return
      }

      const contentScripts = Array.isArray(manifest?.content_scripts) ? manifest.content_scripts : []
      if (contentScripts.length === 0) return

      const targetCssRel = options.to

      let sourceCssRel: string | null = null
      for (const cs of contentScripts) {
        const cssList = Array.isArray(cs?.css) ? cs.css : []
        const hasTarget = cssList.includes(targetCssRel)
        if (!hasTarget) continue
        const assetCss = cssList.find((p: any) => typeof p === 'string' && p.startsWith('assets/') && p.endsWith('.css'))
        if (assetCss) {
          sourceCssRel = assetCss
          cs.css = [targetCssRel]
        } else {
          cs.css = [targetCssRel]
        }
      }

      if (sourceCssRel) {
        const fromAbs = resolve(outDir, sourceCssRel)
        const toAbs = resolve(outDir, targetCssRel)

        if (fs.existsSync(fromAbs)) {
          try {
            fs.mkdirSync(dirname(toAbs), { recursive: true })
          } catch {
            // noop
          }
          try {
            fs.copyFileSync(fromAbs, toAbs)
          } catch {
            // noop
          }
        }
      }

      try {
        fs.writeFileSync(manifestAbs, JSON.stringify(manifest, null, 2))
      } catch {
        // noop
      }
    }
  }
}
