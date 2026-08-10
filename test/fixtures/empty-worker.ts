export default {
  async fetch(): Promise<Response> {
    return new Response("Test fixture", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
