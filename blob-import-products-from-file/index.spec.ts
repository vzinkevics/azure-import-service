import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { BlobServiceClient, BlockBlobClient, ContainerClient } from "@azure/storage-blob";
import httpTrigger from "./index";

jest.mock('@azure/storage-blob');

describe('blob-import-products-from-file', () => {

    let context: Context;
    let req: HttpRequest;
    let blob: Buffer;
    let blobServiceClientMock;
    let containerClientMock;
    let blockBlobClientMock;

    beforeEach(() => {
        req = {} as HttpRequest;

        context = {
            log: jest.fn(),
            bindingData: {
                name: 'testName'
            }
        } as unknown as Context;

        blob = Buffer.from('test');

        blockBlobClientMock = {
            url: 'testUrl',
            name: 'testBlob',
            beginCopyFromURL: jest.fn().mockReturnValue({ pollUntilDone: jest.fn() }),
            delete: jest.fn()
        };

        containerClientMock = {
            getBlockBlobClient: jest.fn().mockReturnValue(blockBlobClientMock),
        };

        blobServiceClientMock = {
            getContainerClient: jest.fn().mockReturnValue(containerClientMock),
        };

        BlobServiceClient.fromConnectionString = jest.fn().mockReturnValue(blobServiceClientMock);
    });

    it('should copy and remove source blob', async () => {
        await (httpTrigger as AzureFunction)(context, req, blob);

        // Test assertions here
        expect(blobServiceClientMock.getContainerClient).toHaveBeenCalledTimes(2);
        expect(blockBlobClientMock.beginCopyFromURL).toHaveBeenCalledWith(blockBlobClientMock.url);
        expect(blockBlobClientMock.delete).toHaveBeenCalled();
    });

    it('should log the parsed records', async () => {
        blob = Buffer.from('title;description;price;count\nvalue1;value2;value3;value4');

        await (httpTrigger as AzureFunction)(context, req, blob);

        expect(context.log).toHaveBeenCalledWith('Record', {
            title: 'value1',
            description: 'value2',
            price: 'value3',
            count: 'value4'
        });
    });

    it('should not log headers line from the file', async () => {
        blob = Buffer.from('title;description;price;count\nvalue1;value2;value3;value4');

        await (httpTrigger as AzureFunction)(context, req, blob);

        expect(context.log).not.toHaveBeenCalledWith('Record', {
            title: 'title',
            description: 'description',
            price: 'price',
            count: 'count'
        });
    });

    it('should return empty object in response body', async () => {
        await (httpTrigger as AzureFunction)(context, req, blob);

        expect(context.res).toEqual({body: {}});
    });
});