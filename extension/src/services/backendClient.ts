import axios, { AxiosInstance } from 'axios';

export class BackendClient {
    private client: AxiosInstance;

    constructor(baseURL: string) {
        this.client = axios.create({
            baseURL,
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    async health(): Promise<any> {
        const response = await this.client.get('/health');
        return response.data;
    }

    async getCapabilities(projectId: string): Promise<any> {
        const response = await this.client.get(`/projects/${projectId}/capabilities`);
        return response.data;
    }

    async createBuild(projectId: string, request: any): Promise<any> {
        const response = await this.client.post(`/projects/${projectId}/builds`, request);
        return response.data;
    }

    async getBuild(projectId: string, buildId: string): Promise<any> {
        const response = await this.client.get(`/projects/${projectId}/builds/${buildId}`);
        return response.data;
    }

    async approveBuild(projectId: string, buildId: string, payload: any): Promise<any> {
        const response = await this.client.post(`/projects/${projectId}/builds/${buildId}/approve`, payload);
        return response.data;
    }

    async rejectBuild(projectId: string, buildId: string): Promise<any> {
        const response = await this.client.post(`/projects/${projectId}/builds/${buildId}/reject`, {});
        return response.data;
    }

    async cancelBuild(projectId: string, buildId: string): Promise<any> {
        const response = await this.client.post(`/projects/${projectId}/builds/${buildId}/cancel`, {});
        return response.data;
    }

    async generateMusic(projectId: string, payload: any): Promise<any> {
        const response = await this.client.post(`/projects/${projectId}/generate`, payload);
        return response.data;
    }

    async getAceStepModels(): Promise<any> {
        const response = await this.client.get('/music/acestep/models');
        return response.data;
    }

    async getHive999Health(): Promise<any> {
        const response = await this.client.get('/hive999/health');
        return response.data;
    }
}
