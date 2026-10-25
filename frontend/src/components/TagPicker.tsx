"use client";

import { useState } from "react";
import { ApiError, TAG_COLORS, createTag, deleteTag, type Tag, type TagColor } from "../lib/api";
import styles from "../app/ui.module.css";
import { translate, useT } from "../lib/i18n";
import { Icon } from "./Icon";

export function TagChip({ tag, small = false }: { tag: Tag; small?: boolean }) {
  return (
    <span className={small ? styles.tagChipSmall : styles.tagChip} data-color={tag.color}>
      {tag.name}
    </span>
  );
}

// Dialog for one file/folder: toggle existing tags on and off, create new
// ones (name + color) and delete tags you no longer need.
export function TagPicker({
  path,
  tags,
  assigned,
  onToggle,
  onTagsChanged,
  onClose,
}: {
  path: string;
  tags: Tag[];
  assigned: string[];
  onToggle: (tagId: string, on: boolean) => void;
  onTagsChanged: (tags: Tag[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [color, setColor] = useState<TagColor>("green");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      const tag = await createTag(name.trim(), color);
      onTagsChanged([...tags, tag].sort((a, b) => a.name.localeCompare(b.name, "de")));
      onToggle(tag.id, true);
      setName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : translate("Tag konnte nicht erstellt werden."));
    }
  }

  async function handleDelete(tag: Tag) {
    if (!window.confirm(`Tag „${tag.name}“ überall entfernen und löschen?`)) return;
    try {
      await deleteTag(tag.id);
      onTagsChanged(tags.filter((t) => t.id !== tag.id));
    } catch {
      setError(translate("Löschen hat nicht geklappt."));
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className={styles.sectionTitle}>{t("Tags")}</h2>
        <p className={styles.hint} style={{ marginBottom: 16 }}>
          {t("für „")}{path.split("/").pop()}{t("“ — Tags gelten über Ordner hinweg, z. B. „Prüfungsrelevant“.")}
        </p>
        {tags.length === 0 ? (
          <p className={styles.hint} style={{ marginBottom: 16 }}>{t("Noch keine Tags — leg unten den ersten an.")}</p>
        ) : (
          <div className={styles.tagPickerList}>
            {tags.map((tag) => {
              const on = assigned.includes(tag.id);
              return (
                <div key={tag.id} className={styles.tagPickerRow}>
                  <label className={styles.checkboxRow} style={{ flex: 1, cursor: "pointer" }}>
                    <input type="checkbox" checked={on} onChange={() => onToggle(tag.id, !on)} />
                    <TagChip tag={tag} />
                  </label>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => handleDelete(tag)}
                    aria-label={`Tag ${tag.name} löschen`}
                    title={t("Tag löschen")}
                    style={{ width: 30, height: 30, fontSize: 14 }}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <form onSubmit={handleCreate} style={{ marginTop: 16 }}>
          <label className={styles.label}>{t("Neuer Tag")}</label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input
              className={styles.input}
              style={{ flex: 1, minWidth: 0, padding: "8px 12px", fontSize: 15 }}
              placeholder={t("z. B. Prüfungsrelevant")}
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
            <button className={styles.smallButtonAccent} type="submit" disabled={!name.trim()}>
              {t("Hinzufügen")}
            </button>
          </div>
          <div className={styles.colorSwatches}>
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={c === color ? styles.colorSwatchActive : styles.colorSwatch}
                data-color={c}
                onClick={() => setColor(c)}
                aria-label={`Farbe ${c}`}
              />
            ))}
          </div>
        </form>
        {error && <div className={styles.errorBox} style={{ marginTop: 12 }}>{error}</div>}
        <button className={styles.smallButton} onClick={onClose} style={{ marginTop: 16 }}>
          {t("Fertig")}
        </button>
      </div>
    </div>
  );
}
