type BudProviderOptions = {
    url: string;
    fetch: any;
    debug: boolean;
    entity: Record<string, Record<string, any>>;
    retry: {
        config: Record<string, any>;
    };
};
declare function BudProvider(this: any, options: BudProviderOptions): {
    exports: {
        getGateway: (spec: {
            redirect_url: string;
            clientid: string;
            customerid: string;
            customersecret: string;
        }) => Promise<any>;
        sdk: () => null;
    };
};
export default BudProvider;
