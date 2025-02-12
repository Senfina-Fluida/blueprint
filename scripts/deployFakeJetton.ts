import { toNano } from '@ton/core';
import { FakeJetton } from '../wrappers/FakeJetton';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const fakeJetton = provider.open(FakeJetton.createFromConfig({}, await compile('FakeJetton')));

    await fakeJetton.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(fakeJetton.address);

    // run methods on `fakeJetton`
}
