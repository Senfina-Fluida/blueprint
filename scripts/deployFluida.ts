import { toNano } from '@ton/core';
import { Fluida } from '../wrappers/Fluida';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const fluida = provider.open(
        Fluida.createFromConfig(
            {
                id: Math.floor(Math.random() * 10000),
                counter: 0,
            },
            await compile('Fluida')
        )
    );

    await fluida.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(fluida.address);

    console.log('ID', await fluida.getID());
}
