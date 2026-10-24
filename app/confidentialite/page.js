'use client';

import LegalPage from '../components/LegalPage';
import { LEGAL_PRIVACY } from '../../lib/legal';

export default function Page() {
  return <LegalPage doc={LEGAL_PRIVACY} />;
}
