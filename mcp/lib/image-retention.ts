export async function deleteImagePrefix(bucket: Pick<R2Bucket, "list" | "delete">, prefix: string) {
  for (;;) {
    const page = await bucket.list({ prefix, limit: 200 });
    if (!page.objects.length) return;
    await bucket.delete(page.objects.map((object) => object.key));
  }
}
