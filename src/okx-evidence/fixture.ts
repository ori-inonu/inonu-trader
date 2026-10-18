import {collectSignals} from '../okx-signals/report';
import {createSyntheticSignalsClient,SYNTHETIC_SIGNALS_TIME_MS} from '../okx-signals/fixture';
import {scanOpportunities} from '../okx-market/okx-scan';
import {createSyntheticOkxClient,SYNTHETIC_SCAN_TIME_MS,SYNTHETIC_PROTOCOL_ID} from '../okx-market/okx-fixture';
import {DEFAULT_RESEARCH_POLICY} from '../okx-market/okx-opportunities';
import {joinEvidence} from './report';

export async function createSyntheticEvidenceReport(){
  const signals=await collectSignals({client:createSyntheticSignalsClient(),query:{chainIndex:'56',walletTypes:['1','2','3'],limit:3},now:()=>SYNTHETIC_SIGNALS_TIME_MS,source:'synthetic'});
  const scan=await scanOpportunities({client:createSyntheticOkxClient(),chainIndex:'56',stage:'NEW',protocolId:SYNTHETIC_PROTOCOL_ID,limit:3,policy:DEFAULT_RESEARCH_POLICY,now:()=>SYNTHETIC_SCAN_TIME_MS,source:'synthetic'});
  return joinEvidence({signals,scan,nowMs:SYNTHETIC_SIGNALS_TIME_MS,maxAgeMs:60000});
}
