// Chrome DevTools / browser well-known 探测请求，静默返回 204
export function GET() {
  return new Response(null, { status: 204 });
}

export function POST() {
  return new Response(null, { status: 204 });
}
