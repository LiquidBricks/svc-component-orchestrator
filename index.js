import { AckPolicy, DeliverPolicy, JetStreamApiCodes } from "@nats-io/jetstream";
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { createComponentServiceRouter } from './router.js'

export const consumerName = 'componentServiceConsumer'

export function createConsumerConfig() {
  return {
    durable_name: consumerName,
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    filter_subjects: [
      createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd['>']).forSubscribe().build(),
      createBasicSubject(natsEvents['*'].component_service['*']['*'].evt['>']).forSubscribe().build(),
      createBasicSubject(natsEvents['*'].domain['*']['*'].edge.has_data_state.result_computed.v1['*']).forSubscribe().build(),
      createBasicSubject(natsEvents['*'].domain['*']['*'].edge.has_data_state.started.v1['*']).forSubscribe().build(),
      createBasicSubject(natsEvents['*'].domain['*']['*'].edge.has_task_state.result_computed.v1['*']).forSubscribe().build(),
      createBasicSubject(natsEvents['*'].domain['*']['*'].edge.has_task_state.started.v1['*']).forSubscribe().build(),
      createBasicSubject(natsEvents['*'].domain['*']['*'].edge.has_gate_state.result_computed.v1['*']).forSubscribe().build(),
      createBasicSubject(natsEvents['*'].domain['*']['*'].edge.injects_into.injected.v1['*']).forSubscribe().build(),
      createBasicSubject(natsEvents['*'].domain['*']['*'].snapshot.data.result.v1['*']).forSubscribe().context('delta').build(),
      createBasicSubject(natsEvents['*'].domain['*']['*'].snapshot.gate.result.v1['*']).forSubscribe().context('delta').build(),
      createBasicSubject(natsEvents['*'].domain['*']['*'].snapshot.task.result.v1['*']).forSubscribe().context('delta').build(),
      createBasicSubject(natsEvents['*'].domain['*']['*'].vertex.stateMachine.started.v1['*']).forSubscribe().build(),
    ],
  }
}

function configuredFilterSubjects(info) {
  const { filter_subjects: filterSubjects = [] } = info?.config ?? {}
  return Array.isArray(filterSubjects) ? filterSubjects : [filterSubjects]
}

function sameFilterSubjects(current, expected) {
  if (current.length !== expected.length) return false
  const currentSet = new Set(current)
  return expected.every(subject => currentSet.has(subject))
}

export async function ensureConsumer({ streamName, jetstreamManager }) {
  const config = createConsumerConfig()

  try {
    const info = await jetstreamManager.consumers.info(streamName, consumerName)
    if (sameFilterSubjects(configuredFilterSubjects(info), config.filter_subjects)) return info

    return jetstreamManager.consumers.update(streamName, consumerName, {
      filter_subjects: config.filter_subjects,
    })
  } catch (error) {
    if (error?.code !== JetStreamApiCodes.ConsumerNotFound) throw error
  }

  return jetstreamManager.consumers.add(streamName, config)
}

export async function Consumer({ streamName, natsContext, g, diagnostics: d }) {
  const diagnostics = d.child({ consumerName })

  const jetstream = await natsContext.jetstream();
  const jetstreamManager = await natsContext.jetstreamManager()

  await ensureConsumer({ streamName, jetstreamManager })

  const c = await jetstream.consumers.get(streamName, consumerName);
  const iter = await c.consume();

  const r = createComponentServiceRouter({ natsContext, g, diagnostics })

  new Promise(async () => {
    for await (const m of iter) {
      await r.request({
        subject: m.subject,
        message: m
      })
    }
  })
}





// const [err, good] = await waitOnFunction({
//   fnc: async () => handler({ natsContext, m, g, diagnostics }),
//   interval: 5_000,
//   timeout: 1000 * 60 * 60, // 1 hour default timeout to avoid runaway
//   onInterval: async () => {
//     m.working()
//   }
// })
// diagnostics.invariant(good, Errors.ROUTER_HANDLER_ERROR, 'uh oh', { err, message: m.json(), subject: m.subject })


async function waitOnFunction(_) {
  const {
    fnc, interval, timeout, onInterval,
  } = deepMerge({
    fnc: async () => { },
    interval: 1000,
    timeout: 60000,
    onInterval: () => { },
  }, _);

  const start = performance.now();
  const elapsed = () => performance.now() - start;
  const fncPromise = fnc(); // Call fnc once
  let timeoutId, intervalId;
  const timeoutPromise = new Promise(r => {
    timeoutId = setTimeout(r, timeout);
  });

  return new Promise((resolve, reject) => {
    const checkit = async () => {
      const intervalPromise = new Promise(r => {
        intervalId = setTimeout(r, interval);
      });

      const result = await Promise.race([
        fncPromise
          .then(res => ({ type: 'completed', value: res }))
          .catch(err => ({
            type: 'failed',
            value: {
              stack: err.stack,
              errMessage: err.message,
              errCode: err.code,
            }
          })),
        timeoutPromise.then(() => ({ type: 'timeout' })),
        intervalPromise.then(() => ({ type: 'interval' })),
      ]);

      clearTimeout(timeoutId);
      clearTimeout(intervalId);

      let onResults = {
        'timeout'() {
          resolve([result]);
        },
        'failed'() {
          resolve([result]);
        },
        'interval'() {
          onInterval({ elapsed: elapsed() });
          checkit();
        },
        'completed'() {
          resolve([null, result]);
        },
      };

      if (onResults[result.type]) {
        return onResults[result.type]();
      } else {
        resolve([new Error('Unknown result type')]);
      }
    };

    checkit();
  });
}


function deepMerge(target, source) {
  if (typeof target !== "object" || typeof source !== "object") return source;

  for (const key in source) {
    if (source[key] && typeof source[key] === "object") {
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
