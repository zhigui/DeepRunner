import { describe, expect, it } from 'vitest'
import { deepRunnerDeepLinkFromArgv, parseDeepRunnerDeepLink } from '../src/deep-link.js'

describe('DeepRunner external links', () => {
  it('accepts only the canonical market plugin route', () => {
    expect(parseDeepRunnerDeepLink('deeprunner://market/plugin/dsh-im')).toEqual({ kind: 'market-plugin', pluginId: 'dsh-im' })
    expect(parseDeepRunnerDeepLink('deeprunner://market/plugin/@xmanrui/dsh-im')).toEqual({ kind: 'market-plugin', pluginId: '@xmanrui/dsh-im' })
    expect(deepRunnerDeepLinkFromArgv(['DeepRunner.exe', '--flag', 'deeprunner://market/plugin/example.plugin'])).toMatchObject({ pluginId: 'example.plugin' })
  })

  it.each([
    'https://market/plugin/dsh-im',
    'deeprunner://evil/plugin/dsh-im',
    'deeprunner://market/plugin/dsh-im?version=9.9.9',
    'deeprunner://market/plugin/dsh-im#install',
    'deeprunner://user@market/plugin/dsh-im',
    'deeprunner://market:444/plugin/dsh-im',
    'deeprunner://market/plugin/%64sh-im',
    'deeprunner://market/plugin/../dsh-im',
    'deeprunner://market/plugin/DSH-IM',
    'deeprunner://market/plugin/dsh-im/extra',
    'deeprunner://market/plugin/xmanrui/dsh-im',
    'deeprunner://market/plugin/@xmanrui/dsh-im/extra',
  ])('rejects untrusted variant %s', (value) => {
    expect(parseDeepRunnerDeepLink(value)).toBeUndefined()
  })
})
