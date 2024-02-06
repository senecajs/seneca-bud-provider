type FullBudProviderOptions = {
    url: string;
    fetch: any;
    debug: boolean;
    print: {
        request: boolean;
    };
    entity: Record<string, Record<string, any>>;
    retry: {
        config: Record<string, any>;
    };
    wait: {
        refresh: {
            max: number;
            interval: number;
        };
    };
    limit: {
        retry: number;
    };
    store: {
        saveToken: any;
        loadToken: any;
    };
};
declare function BudProvider(this: any, options: FullBudProviderOptions): {
    exports: {
        requestTokens: () => Promise<true | {
            when: number;
            prev: {
                refreshToken: any;
                accessToken: any;
                config: string;
            };
            current: {
                refreshToken: any;
                accessToken: any;
                config: string;
            };
        }>;
        loadTokens: () => Promise<{
            when: number;
            refreshToken: any;
            accessToken: any;
        }>;
        getGateway: (spec: {
            redirect_url: string;
            clientid: string;
            customerid: string;
            customersecret: string;
            account_id?: string;
            mode?: string;
        }) => Promise<any>;
        sdk: () => null;
        stats: () => {
            refresh: number;
            access: number;
            loadrefresh: number;
            loadaccess: number;
            req: number;
            res: number;
            error: number;
            notfound: number;
        };
        util: {
            getTokenState: () => "active" | "start" | "refresh" | "request" | "init";
            setTokenState: (tokenStateIn: "active" | "start" | "refresh" | "request" | "init") => "active" | "start" | "refresh" | "request" | "init";
            getToken: (name: string) => any;
            setToken: (name: string, value: string) => void;
        };
    };
};
export default BudProvider;
