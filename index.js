import { AckPolicy, DeliverPolicy } from "@nats-io/jetstream";
import { createComponentServiceRouter } from './router.js'

const consumerName = 'componentServiceConsumer'
export async function componentServiceConsumer({ streamName, natsContext, g, diagnostics: d }) {
  const diagnostics = d.child({ consumerName })

  const jetstream = await natsContext.jetstream();
  const jetstreamManager = await natsContext.jetstreamManager()

  // Ensure a clean slate: delete existing consumer if present
  try {
    await jetstreamManager.consumers.delete(streamName, consumerName)
  } catch (_) { /* ignore if not found or unsupported */ }

  await jetstreamManager.consumers.add(streamName, {
    durable_name: consumerName,
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    filter_subjects: [
      '*.component-service.*.*.cmd.>',
      '*.component-service.*.*.evt.>',
    ],
  });

  const c = await jetstream.consumers.get(streamName, consumerName);
  const iter = await c.consume();

  const r = createComponentServiceRouter({ natsContext, g, diagnostics })

  new Promise(async () => {
    for await (const m of iter) {
      console.log({ subject: m.subject })
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
