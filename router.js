import router from "@liquid-bricks/lib-nats-subject/router";
import { Errors } from "./errors.js";
import * as component from './core/component/index.js'
import * as componentAgent from './core/componentAgent/index.js'
import * as componentInstance from './core/componentInstance/index.js'
import * as data from './core/data/index.js'
import * as domain from './core/domain/index.js'
import * as gate from './core/gate/index.js'
import * as importEntity from './core/import/index.js'
import * as task from './core/task/index.js'
import { dataMapper as createDataMapper } from '@liquid-bricks/spec-domain/domain'

export const routes = [
  [componentAgent.cmd.registerComponent.path, componentAgent.cmd.registerComponent.spec],
  [componentAgent.cmd.register.path, componentAgent.cmd.register.spec],
  [component.evt.registerDone.path, component.evt.registerDone.spec],
  [componentInstance.cmd.create.path, componentInstance.cmd.create.spec],
  [componentInstance.cmd.start.path, componentInstance.cmd.start.spec],
  [componentInstance.cmd.start_dependants.path, componentInstance.cmd.start_dependants.spec],
  [componentInstance.cmd.check_state_machine_completion.path, componentInstance.cmd.check_state_machine_completion.spec],
  [data.cmd.start.path, data.cmd.start.spec],
  [gate.cmd.start.path, gate.cmd.start.spec],
  [importEntity.cmd.start.path, importEntity.cmd.start.spec],
  [task.cmd.start.path, task.cmd.start.spec],
  [componentInstance.evt.createDone.path, componentInstance.evt.createDone.spec],
  [component.evt.compute_function.data.path, component.evt.compute_function.data.spec],
  [domain.edge.has_data_state.result_computed.path, domain.edge.has_data_state.result_computed.spec],
  [domain.edge.has_task_state.result_computed.path, domain.edge.has_task_state.result_computed.spec],
  [domain.vertex.gateInstanceRef.result_computed.path, domain.vertex.gateInstanceRef.result_computed.spec],
  [component.evt.compute_function.gate.path, component.evt.compute_function.gate.spec],
  [component.evt.compute_function.task.path, component.evt.compute_function.task.spec],
  [componentInstance.cmd.injectResults.path, componentInstance.cmd.injectResults.spec],
  [componentInstance.evt.startDone.path, componentInstance.evt.startDone.spec],
]

export function createComponentServiceRouter({
  natsContext,
  g,
  diagnostics,
  dataMapper = createDataMapper({ g, diagnostics }),
  projectionReadinessTimeoutMs,
  projectionReadinessIntervalMs,
}) {
  return router({
    tokens: ['env', 'ns', 'tenant', 'context', 'channel', 'entity', 'action', 'version', 'id'],
    context: {
      natsContext,
      g,
      diagnostics,
      dataMapper,
      projectionReadinessTimeoutMs,
      projectionReadinessIntervalMs,
    },
  })
    .before(({ rootCtx: { diagnostics }, scope, message }) => {
      // diagnostics.trace('event received', { subject: message.subject, message: message.json() })

      const timer = diagnostics.timer('GENERIC_OPERATION', { subject: message.subject })
      return { timer }
    })
    .after(({ rootCtx: { diagnostics }, scope: { timer }, message }) => {
      // return timer.stop({})
    })

    .beforeEach(({ rootCtx: { diagnostics }, info: { params, values, stage, index, fn }, scope, message }) => {
      const handlerDiagnostics = diagnostics.child({
        router: { params, values, stage, index, fn },
        scope,
        message: message.json(),
      })

      return { handlerDiagnostics }
    })
    .route({}, { children: routes })
    .default({
      handler: async ({ message, rootCtx: { diagnostics } }) => {
        diagnostics.invariant(
          message.term(`No handler for subject: ${message.subject}`) ?? false,
          Errors.ROUTER_UNKNOWN_SUBJECT,
          `No handler for subject: ${message.subject}`,
          { subject: message.subject, message: message?.json?.() }
        )
      }
    })
    .error(({ error, rootCtx: { diagnostics } }, ...rest) => {
      if (error instanceof diagnostics.DiagnosticError) {
        return //we already have an error diagnosed, dont throw another one.
      }
      throw diagnostics.error(
        Errors.ROUTER_HANDLER_ERROR,
        'component service router error',
        { error, rest },
      )
    })
    .abort(({ reason, stage, message, rootCtx: { diagnostics } }) => {
      try { message?.ack?.() } catch (_) { /* ignore */ }
      return { status: 'aborted' }
    })
}
