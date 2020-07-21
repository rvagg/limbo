import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { rollup } from 'rollup'
import { join, dirname } from 'path'
import { promises as fs } from 'fs'
import alias from '@rollup/plugin-alias'

const cwd = process.cwd()

const mkconfigs = (name, files, browser) => {
  const dir = 'dist/cjs-' + ( browser ? 'browser' : 'node' )
  const preserveModules = true
  const entries = []
  if (browser) {
    if (browser.exports) {
      for (const [key, value] of Object.entries(browser.exports)) {
        if (value.browser) {
          const replacement = join(cwd, value.browser.slice(1))
          entries.push({ find: `${name}${key.slice(1)}`, replacement })
        }
      }
      // TODO: handle single export
    }
  }
  entries.push({ find: name, replacement: cwd })
  const plugins = [ alias({ entries }) ]

  const ext = browser ? 'js' : 'cjs'
  const treeshake = false
  const output = { dir, preserveModules, format: 'cjs', entryFileNames: `[name].${ext}` }
  const createConfig = f => ({ treeshake, input: f, output, plugins })
  const configs = files.map(createConfig)
  return configs
}

const pkg = JSON.parse(readFileSync(join(cwd, 'package.json')))
const { name } = pkg

const run = async ({files, save}) => {
  console.log({save})
  const configs = [ ...mkconfigs(name, files), ...mkconfigs(name, files, pkg) ]
  const written = new Map()
  const writeConfig = async config => {
    const bundle = await rollup(config)
    const { output } = await bundle.generate(config.output)
    const { dir } = config.output
    for (const chunk of output) {
      let filename = chunk.facadeModuleId.replace(cwd, dir)
      const facade = filename.replace(cwd, '')
      filename = filename.slice(0, filename.length - chunk.fileName.length)
      filename = join(filename, chunk.fileName)
      if (written.has(facade)) {
        continue
      }
      written.set(facade, join(dir, chunk.fileName))
      await fs.mkdir(dirname(filename), { recursive: true })
      await fs.writeFile(filename, chunk.code)
    }
  }
  const running = []
  for (const config of configs) {
    running.push(writeConfig(config))
  }
  await Promise.all(running)
  if (save) {
    const browser = {}
    const iter = Object.entries(Object.fromEntries(written.entries())).sort()
    for (let [key, value] of iter) {
      if (key.startsWith('dist/cjs-browser/')) {
        key = './' + key.slice('dist/cjs-browser/'.length)
        value = './' + value
        browser[key] = value
      }
    }
    pkg.browser = browser
    writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkg, null, 2))
  }
}

export default run
