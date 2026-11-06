import 'server-only';
import { createAPIHandler, type FileRouteHandlers } from 'filesystem-routing/api';
import routes from 'virtual:file-routes';

// Dispatches requests to the GET/POST/... exports of src/routes. Handlers are typed with the
// richer ApiEvent, so the manifest is widened to the adapter's structural type here.
export const apiHandler = createAPIHandler(routes as unknown as readonly FileRouteHandlers[]);
