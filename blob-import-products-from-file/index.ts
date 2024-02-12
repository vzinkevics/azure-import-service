import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { BlobServiceClient } from "@azure/storage-blob";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest, blob: Buffer): Promise<void> {
    context.log('HTTP trigger function processed a request.', req);

    const blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env.AzureWebJobsStorage
    );
    const uploadedContainer = blobServiceClient.getContainerClient(
        'uploaded'
    );
    const parsedContainer = blobServiceClient.getContainerClient(
        'parsed'
    );

    const sourceBlob = uploadedContainer.getBlockBlobClient(
        context.bindingData.name
    );
    const destinationBlob = parsedContainer.getBlockBlobClient(
        sourceBlob.name
    );

    // logging
    const headers = ["title", "description", "price", "count"];
    blob
        .toString()
        .split("\n")
        .map((e) => e.trim())
        .map((e) => e.split(";"))
        .forEach((arr, i) => {
            if (i > 0) {
                const record = {};
                arr.forEach((value, i) => {
                    record[headers[i]] = value;
                });
                context.log("Record1", record);
            }
        });

    // copy
    const response = await destinationBlob.beginCopyFromURL(sourceBlob.url);
    await response.pollUntilDone();
    await sourceBlob.delete();

    context.res = {
        body: {}
    };
};

export default httpTrigger;