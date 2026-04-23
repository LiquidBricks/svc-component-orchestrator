import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { createComponentVertex } from '../../../../../../../core/component/cmd/register/handler/createComponentVertex.js'
import { domain, withGraphContext } from '../helpers.mjs'

test('createComponentVertex creates component vertex', async () => {
  await withGraphContext(async ({ g, dataMapper }) => {
    const component = componentBuilder('VertexComponent').toJSON()

    const { componentVID } = await createComponentVertex({ rootCtx: { dataMapper }, scope: { component } })
    assert.ok(componentVID, 'componentVID missing')

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()
    assert.equal(componentId, componentVID)
  })
})
