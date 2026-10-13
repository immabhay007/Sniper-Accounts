import { Modal } from './Modal';
import type { ChangeEvent } from 'react';

export type DepositFundModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
  depositedFund: string;
  modeOfTransfer: string;
  onChangeDepositedFund: (value: string) => void;
  onChangeModeOfTransfer: (value: string) => void;
  showFileUpload?: boolean;
  files?: File[];
  onFilesChange?: (files: File[]) => void;
  title?: string;
};

export const DepositFundModal = ({
  isOpen,
  onClose,
  onSave,
  isSaving,
  depositedFund,
  modeOfTransfer,
  onChangeDepositedFund,
  onChangeModeOfTransfer,
  showFileUpload = false,
  files = [],
  onFilesChange,
  title = 'Deposit fund',
}: DepositFundModalProps) => {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const pickedFiles = Array.from(event.target.files ?? []);
    if (pickedFiles.length === 0) return;
    onFilesChange?.([...files, ...pickedFiles]);
  };

  return (
    <Modal title={title} isOpen={isOpen} onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span>Fund *</span>
          <input
            value={depositedFund}
            onChange={e => onChangeDepositedFund(e.target.value)}
            className="input-field"
            type="number"
            min="0"
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span>Mode of Transfer</span>
          <input
            value={modeOfTransfer}
            onChange={e => onChangeModeOfTransfer(e.target.value)}
            className="input-field"
            type="text"
          />
        </label>
        {showFileUpload && onFilesChange && (
          <label className="flex flex-col gap-2 text-sm text-slate-200 sm:col-span-2">
            <span>Upload Bills</span>
            <input
              className="input-field"
              type="file"
              accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
              multiple
              onChange={handleFileChange}
            />
            {files.length > 0 ? (
              <p className="text-xs text-slate-300">{files.length} file{files.length === 1 ? '' : 's'} selected</p>
            ) : null}
          </label>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" className="btn-modal-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn-modal-primary" onClick={onSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </Modal>
  );
};
