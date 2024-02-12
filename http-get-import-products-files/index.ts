import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { v4 as uuidv4 } from "uuid";
import { BlobSASPermissions, BlobServiceClient } from "@azure/storage-blob";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.log('HTTP trigger function processed a request.', req);

    const blobName = context.bindingData?.query?.name ?? `${uuidv4()}.csv`;

    const blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env.AzureWebJobsStorage
    );
    const containerClient = blobServiceClient.getContainerClient(
        'uploaded'
    );
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const blobSASUrl = await blockBlobClient.generateSasUrl({
        permissions: BlobSASPermissions.parse("racw"),
        startsOn: new Date(),
        expiresOn: new Date(new Date().valueOf() + 86400),
    });

    context.res = {
        // status: 200, /* Defaults to 200 */
        body: { blobSASUrl },
    };
};

export default httpTrigger;