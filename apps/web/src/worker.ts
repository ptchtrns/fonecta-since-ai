import app from 'virtual:solid-ssr-handler';

export default {
  fetch(request) {
    return app.fetch(request);
  },
} satisfies ExportedHandler;
