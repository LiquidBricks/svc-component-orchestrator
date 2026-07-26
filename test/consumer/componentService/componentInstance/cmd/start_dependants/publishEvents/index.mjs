import test from 'node:test'
import assert from 'node:assert/strict'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { publishEvents } from '../../../../../../../core/componentInstance/cmd/start_dependants/publishEvents/index.js'
import { spec as startDependantsSpec } from '../../../../../../../core/componentInstance/cmd/start_dependants/index.js'
import { runHookGroup } from '../../../../../../util/invokeRoute.js'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


test('publishEvents publishes start commands for dependant states', async () => {
  const published = []
  const natsContext = {
    publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }),
  }

  await runHookGroup(publishEvents, {
    rootCtx: { natsContext },
    routeCtx: startDependantsSpec.context,
    scope: {
      starters: [
        {
          instanceId: 'instance-1',
          dataStateIds: ['data-1'],
          taskStateIds: ['task-1', 'task-2'],
        },
      ],
    },
  })

  const dataSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.data.start.v1['*']).forPublish()
    .env('prod')
    .build()
  const taskSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.task.start.v1['*']).forPublish()
    .env('prod')
    .build()

  const dataEvents = published.filter(({ subject }) => subject === dataSubject)
  assert.equal(dataEvents.length, 1)
  assert.deepEqual(dataEvents[0].payload.data, { instanceId: 'instance-1', stateId: 'data-1' })

  const taskEvents = published.filter(({ subject }) => subject === taskSubject)
  assert.equal(taskEvents.length, 2)
  assert.deepEqual(
    taskEvents.map(({ payload }) => payload.data.stateId).sort(),
    ['task-1', 'task-2'],
  )
  assert.ok(taskEvents.every(({ payload }) => payload.data.instanceId === 'instance-1'))
})

test('publishEvents publishes import start commands with parent instance context', async () => {
  const published = []
  const natsContext = {
    publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }),
  }

  await runHookGroup(publishEvents, {
    rootCtx: { natsContext },
    routeCtx: startDependantsSpec.context,
    scope: {
      starters: [
        {
          instanceId: 'parent-instance',
          dataStateIds: [],
          taskStateIds: [],
          importInstanceIds: ['child-instance'],
        },
      ],
    },
  })

  const startImportSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.import.start.v1['*']).forPublish()
    .env('prod')
    .build()

  const importEvents = published.filter(({ subject }) => subject === startImportSubject)
  assert.equal(importEvents.length, 1)
  assert.deepEqual(importEvents[0].payload.data, {
    instanceId: 'child-instance',
    parentInstanceId: 'parent-instance',
  })
})

test('publishEvents delegates gate work to gate.start', async () => {
  const published = []
  const natsContext = {
    publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }),
  }

  await runHookGroup(publishEvents, {
    rootCtx: { natsContext },
    routeCtx: startDependantsSpec.context,
    scope: {
      starters: [
        {
          instanceId: 'instance-gate-parent',
          dataStateIds: [],
          taskStateIds: [],
          gateInstanceIds: ['instance-gate-child'],
        },
      ],
    },
  })

  const gateStartSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.gate.start.v1['*']).forPublish()
    .env('prod')
    .build()
  const gateComputeSubject = createBasicSubject(natsEvents['*'].gateway['*']['*'].cmd.component.compute_function.v1['*']).forPublish()
    .env('prod')
    .build()

  const gateStartEvents = published.filter(({ subject }) => subject === gateStartSubject)
  assert.equal(gateStartEvents.length, 1)
  assert.deepEqual(gateStartEvents[0].payload.data, {
    instanceId: 'instance-gate-child',
    parentInstanceId: 'instance-gate-parent',
  })

  const directComputeEvents = published.filter(({ subject }) => subject === gateComputeSubject)
  assert.equal(directComputeEvents.length, 0, 'gate compute_function should be emitted by gate.cmd.start handler')
})
