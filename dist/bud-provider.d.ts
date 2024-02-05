type FullBudProviderOptions = {
    url: string;
    fetch: any;
    debug: boolean;
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
        getGateway: (spec: {
            redirect_url: string;
            clientid: string;
            customerid: string;
            customersecret: string;
            account_id?: string;
            mode?: string;
        }) => Promise<any>;
        sdk: () => null;
        stats: () => any;
        util: {
            getTokenState: () => "init" | "start" | "request" | "refresh" | "active";
            setTokenState: (tokenStateIn: "init" | "start" | "request" | "refresh" | "active") => "init" | "start" | "request" | "refresh" | "active";
            getToken: (name: string) => any;
            setToken: (name: string, value: string) => void;
        };
    };
};
export default BudProvider;
