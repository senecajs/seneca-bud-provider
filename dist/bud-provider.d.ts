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
};
declare function BudProvider(this: any, options: FullBudProviderOptions): {
    exports: {
        getGateway: (spec: {
            redirect_url: string;
            clientid: string;
            customerid: string;
            customersecret: string;
        }) => Promise<any>;
        sdk: () => null;
        getToken: (name: string) => any;
        setToken: (name: string, value: string) => void;
    };
};
export default BudProvider;
