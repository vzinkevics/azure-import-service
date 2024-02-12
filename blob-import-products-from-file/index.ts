import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { BlobServiceClient } from "@azure/storage-blob";
import { ServiceBusClient } from "@azure/service-bus";

const httpTrigger: AzureFunction = async function (context: Context, blob: Buffer): Promise<void> {
    context.log('HTTP trigger function processed a request.', blob);

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

    const serviceBusConnectionString = process.env.ServiceBusConnectionString;
    const serviceBusClient = new ServiceBusClient(serviceBusConnectionString);
    const sender = serviceBusClient.createSender('products-updates-topic');

    const products = blob
        .toString()
        .split("\n")
        .map((e) => e.trim())
        .map((e) => e.split(";"));

    for (let i = 0; i < products.length; i++) {
        const product = products[i][0].split(',');
        if (i > 0 && product.length > 1) {
            const message = {
                title: product[0].trim(),
                description: product[1].trim(),
                price: Number(product[2].trim()),
                count: Number(product[3].trim()),
            };

            context.log('Message:', message);

            await sender.sendMessages({
                body: message,
                applicationProperties: {
                    eventType: 'product-created',
                },
            });

            context.log('Message sent');
        }
    }

    // copy
    const response = await destinationBlob.beginCopyFromURL(sourceBlob.url);
    await response.pollUntilDone();
    await sourceBlob.delete();

    context.res = {
        body: {}
    };
};

export default httpTrigger;