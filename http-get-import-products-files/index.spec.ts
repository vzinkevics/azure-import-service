import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { BlobSASPermissions, BlobServiceClient, BlockBlobClient } from "@azure/storage-blob";
import httpTrigger from './index';
import { v4 as uuidv4 } from "uuid";

jest.mock('@azure/storage-blob');
jest.mock('uuid', () => ({ v4: jest.fn() }));
jest.mock("uuid", () => ({
    v4: jest.fn(() => "randomUuid"),
}));

describe('http-get-import-products-files', () => {

    let context: Context;
    let req: HttpRequest;
    let blobServiceClientMock;
    let containerClientMock;
    let blockBlobClientMock;
    let blobSASUrl;

    beforeEach(() => {
        req = {} as HttpRequest;

        context = {
            log: jest.fn(),
            bindingData: {
                query: {
                    name: 'testName'
                }
            }
        } as unknown as Context;

        blobSASUrl = 'testSASUrl';
        (uuidv4 as jest.Mock).mockImplementation(() => 'randomUuid');

        blockBlobClientMock = {
            generateSasUrl: jest.fn().mockReturnValue(blobSASUrl)
        };

        containerClientMock = {
            getBlockBlobClient: jest.fn().mockReturnValue(blockBlobClientMock)
        };

        blobServiceClientMock = {
            getContainerClient: jest.fn().mockReturnValue(containerClientMock)
        };

        BlobServiceClient.fromConnectionString = jest.fn().mockReturnValue(blobServiceClientMock);
    });

    it('should generate SAS Url', async () => {
        await (httpTrigger as AzureFunction)(context, req);

        expect(blobServiceClientMock.getContainerClient).toHaveBeenCalledWith('uploaded');
        expect(blockBlobClientMock.generateSasUrl).toHaveBeenCalled();

        // Ensure SAS URL is generated correctly and returned in response
        expect(context.res).toEqual({
            body: { blobSASUrl: blobSASUrl },
        });
    });

    it('should use query param "name" as blob name', async () => {
        await (httpTrigger as AzureFunction)(context, req);

        expect(containerClientMock.getBlockBlobClient).toHaveBeenCalledWith('testName');
    });

    it('should use uuid as blob name if query param "name" is not present', async () => {
        delete context.bindingData.query.name;

        await (httpTrigger as AzureFunction)(context, req);

        expect(containerClientMock.getBlockBlobClient).toHaveBeenCalledWith('randomUuid.csv');
    });

    // Add more test cases as needed
});