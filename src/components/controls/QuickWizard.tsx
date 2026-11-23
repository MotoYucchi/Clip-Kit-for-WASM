import { translate } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore, type ControlTab } from '../../store/useUiStore';
import type { EditConfig } from '../../types/edit';

interface WizardAction {
  id: string;
  titleKey: Parameters<typeof translate>[1];
  descKey: Parameters<typeof translate>[1];
  targetTab: ControlTab;
  patch: Partial<EditConfig>;
  videoOnly?: boolean;
}

const WIZARD_ACTIONS: WizardAction[] = [
  {
    id: 'compress',
    titleKey: 'wizard.compress',
    descKey: 'wizard.compressDesc',
    targetTab: 'output',
    patch: { taskType: 'video', container: 'mp4', videoCodec: 'h264', compressionPreset: 'small' },
    videoOnly: true,
  },
  {
    id: 'trim',
    titleKey: 'wizard.trim',
    descKey: 'wizard.trimDesc',
    targetTab: 'trim',
    patch: { taskType: 'video', trimEnabled: true, cutMode: 'fast' },
  },
  {
    id: 'aspect',
    titleKey: 'wizard.aspect',
    descKey: 'wizard.aspectDesc',
    targetTab: 'resize',
    patch: { taskType: 'video', aspectPreset: '9:16', aspectMode: 'blur' },
    videoOnly: true,
  },
  {
    id: 'resize',
    titleKey: 'wizard.resize',
    descKey: 'wizard.resizeDesc',
    targetTab: 'resize',
    patch: { taskType: 'video', resolutionPreset: '720p' },
    videoOnly: true,
  },
  {
    id: 'speed',
    titleKey: 'wizard.speed',
    descKey: 'wizard.speedDesc',
    targetTab: 'speed',
    patch: { taskType: 'video', speed: 1.5 },
  },
  {
    id: 'rotate',
    titleKey: 'wizard.rotate',
    descKey: 'wizard.rotateDesc',
    targetTab: 'transform',
    patch: { taskType: 'video', rotation: 90 },
    videoOnly: true,
  },
  {
    id: 'extractAudio',
    titleKey: 'wizard.extractAudio',
    descKey: 'wizard.extractAudioDesc',
    targetTab: 'audio',
    patch: { taskType: 'audio-extract', audioExtractFormat: 'mp3' },
  },
  {
    id: 'mute',
    titleKey: 'wizard.mute',
    descKey: 'wizard.muteDesc',
    targetTab: 'audio',
    patch: { taskType: 'video', muteMode: 'all' },
    videoOnly: true,
  },
  {
    id: 'bgm',
    titleKey: 'tab.multitrack',
    descKey: 'mt.emptyTracks',
    targetTab: 'multitrack',
    patch: { taskType: 'video', originalAudioHandling: 'mix' },
    videoOnly: true,
  },
  {
    id: 'snapshot',
    titleKey: 'wizard.snapshot',
    descKey: 'wizard.snapshotDesc',
    targetTab: 'snapshot',
    patch: { taskType: 'snapshot', snapshotFormat: 'png' },
    videoOnly: true,
  },
];

export function QuickWizard() {
  const { lang } = useUiStore();
  const { setActiveTab, setUiMode, setMobileSheetOpen } = useUiStore();
  const { source, updateConfig } = useProjectStore();
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);

  const isAudioOnly = Boolean(source?.metadata.isAudioOnly);

  const handleSelect = (action: WizardAction) => {
    updateConfig(action.patch);
    setActiveTab(action.targetTab);
    setUiMode('advanced');
    setMobileSheetOpen(true);
  };

  return (
    <section className="panel" aria-label={t('wizard.title')}>
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{t('wizard.title')}</h2>
          <p className="panel-subtitle">{t('wizard.subtitle')}</p>
        </div>
      </div>

      <div className="wizard-grid">
        {WIZARD_ACTIONS.filter((a) => !(isAudioOnly && a.videoOnly)).map((action) => (
          <button
            key={action.id}
            type="button"
            className="preset-card"
            onClick={() => handleSelect(action)}
          >
            <span className="preset-card-title">{t(action.titleKey)}</span>
            <span className="preset-card-desc">{t(action.descKey)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
