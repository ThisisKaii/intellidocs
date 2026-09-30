import { Router } from 'express'
import { liveness, readiness } from '../controllers/healthController'

const router = Router()

// Unauthenticated: the proxy and orchestrators call these without a user token.
// `/health` stays an alias of `/live` because render.yaml and the container
// healthchecks already point at it.
router.get('/', liveness)
router.get('/live', liveness)
router.get('/ready', readiness)

export default router
