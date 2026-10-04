const { S3Client, HeadBucketCommand, CreateBucketCommand } = require('/app/node_modules/@aws-sdk/client-s3');
const s3 = new S3Client({ region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT, forcePathStyle: true });
(async () => {
  try { await s3.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET })); }
  catch (e) {
    if (e.$metadata?.httpStatusCode !== 404 && e.name !== 'NotFound' && e.name !== 'NoSuchBucket') throw e;
    await s3.send(new CreateBucketCommand({ Bucket: process.env.S3_BUCKET }));
  }
  console.log('Private original-file bucket ready');
})().catch(e => { console.error(e.name); process.exitCode = 1; });
