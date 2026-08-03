import test from 'node:test'
import assert from 'node:assert/strict'
import { JetStreamApiCodes } from '@nats-io/jetstream'

import {
  consumerName,
  createConsumerConfig,
  ensureConsumer,
} from '../index.js'

test('consumer configuration uses snapshots instead of raw data/task result facts', () => {
  const { filter_subjects: subjects } = createConsumerConfig()

  assert.ok(subjects.includes('*.domain.*.delta.snapshot.data.result.v1.*'))
  assert.ok(subjects.includes('*.domain.*.delta.snapshot.gate.result.v1.*'))
  assert.ok(subjects.includes('*.domain.*.delta.snapshot.task.result.v1.*'))
  assert.ok(subjects.includes('*.domain.*.delta.snapshot.data.computation_failed.v1.*'))
  assert.ok(subjects.includes('*.domain.*.delta.snapshot.gate.computation_failed.v1.*'))
  assert.ok(subjects.includes('*.domain.*.delta.snapshot.task.computation_failed.v1.*'))
  assert.equal(subjects.includes('*.domain.*.*.edge.has_data_state.result_computed.v1.*'), false)
  assert.equal(subjects.includes('*.domain.*.*.edge.has_task_state.result_computed.v1.*'), false)
  assert.equal(subjects.includes('*.domain.*.*.edge.has_data_state.computation_failed.v1.*'), false)
  assert.equal(subjects.includes('*.domain.*.*.edge.has_task_state.computation_failed.v1.*'), false)
  assert.ok(subjects.includes('*.domain.*.*.edge.has_gate_state.result_computed.v1.*'))
  assert.ok(subjects.includes('*.domain.*.*.edge.has_gate_state.computation_failed.v1.*'))
})

test('consumer configuration subscribes only to routed component-service events', () => {
  const { filter_subjects: subjects } = createConsumerConfig()

  assert.ok(subjects.includes('*.component-service.*.*.evt.component.registerDone.v1.*'))
  assert.ok(subjects.includes('*.component-service.*.function_result.evt.component.compute_function.v1.data'))
  assert.ok(subjects.includes('*.component-service.*.function_result.evt.component.compute_function.v1.gate'))
  assert.ok(subjects.includes('*.component-service.*.function_result.evt.component.compute_function.v1.task'))
  assert.ok(subjects.includes('*.component-service.*.function_result.evt.component.compute_function_failed.v1.data'))
  assert.ok(subjects.includes('*.component-service.*.function_result.evt.component.compute_function_failed.v1.gate'))
  assert.ok(subjects.includes('*.component-service.*.function_result.evt.component.compute_function_failed.v1.task'))
  assert.equal(subjects.includes('*.component-service.*.*.evt.>'), false)
  assert.equal(subjects.includes('*.component-service.*.*.evt.componentInstance.startDone.v1.*'), false)
})

test('ensureConsumer preserves a durable whose filters are current', async () => {
  const config = createConsumerConfig()
  const info = { config }
  const calls = []
  const jetstreamManager = {
    consumers: {
      info: async (...args) => {
        calls.push(['info', ...args])
        return info
      },
      update: async (...args) => calls.push(['update', ...args]),
      add: async (...args) => calls.push(['add', ...args]),
    },
  }

  const result = await ensureConsumer({ streamName: 'componentStream', jetstreamManager })

  assert.equal(result, info)
  assert.deepEqual(calls, [['info', 'componentStream', consumerName]])
})

test('ensureConsumer updates filters without resetting the durable ACK floor', async () => {
  const calls = []
  const updated = { config: createConsumerConfig() }
  const jetstreamManager = {
    consumers: {
      info: async (...args) => {
        calls.push(['info', ...args])
        return { config: { filter_subjects: ['old.filter'] } }
      },
      update: async (...args) => {
        calls.push(['update', ...args])
        return updated
      },
      add: async (...args) => calls.push(['add', ...args]),
    },
  }

  const result = await ensureConsumer({ streamName: 'componentStream', jetstreamManager })

  assert.equal(result, updated)
  assert.equal(calls[0][0], 'info')
  assert.deepEqual(calls[1], [
    'update',
    'componentStream',
    consumerName,
    { filter_subjects: createConsumerConfig().filter_subjects },
  ])
  assert.equal(calls.some(([method]) => method === 'add'), false)
})

test('ensureConsumer creates the durable only when it is missing', async () => {
  const config = createConsumerConfig()
  const added = { config }
  const calls = []
  const jetstreamManager = {
    consumers: {
      info: async (...args) => {
        calls.push(['info', ...args])
        const error = new Error('consumer not found')
        error.code = JetStreamApiCodes.ConsumerNotFound
        throw error
      },
      update: async (...args) => calls.push(['update', ...args]),
      add: async (...args) => {
        calls.push(['add', ...args])
        return added
      },
    },
  }

  const result = await ensureConsumer({ streamName: 'componentStream', jetstreamManager })

  assert.equal(result, added)
  assert.deepEqual(calls, [
    ['info', 'componentStream', consumerName],
    ['add', 'componentStream', config],
  ])
})
