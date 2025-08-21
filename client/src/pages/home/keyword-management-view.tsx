import { KeywordManager } from "@/components/keyword-manager";

interface Props {
  onBack: () => void;
}

export function KeywordManagementView({ onBack }: Props) {
  return <KeywordManager onBack={onBack} />;
}

export default KeywordManagementView;
