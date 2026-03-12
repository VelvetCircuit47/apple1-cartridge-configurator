import { useState, useEffect } from 'react';
import Emulator from './Emulator.jsx';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const API = '';

function SortableProgram({ program, checked, onToggle, index }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: program.id, disabled: !checked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const totalBytes = program.segments.reduce((sum, s) => sum + s.length, 0);
  const totalKB = (totalBytes / 1024).toFixed(1);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`program-card ${checked ? 'selected' : ''} ${!program.available ? 'unavailable' : ''}`}
    >
      <div className="program-left">
        <input
          type="checkbox"
          checked={checked}
          disabled={!program.available}
          onChange={() => onToggle(program.id)}
        />
        {checked && (
          <span className="drag-handle" {...attributes} {...listeners} title="Przeciągnij, aby zmienić kolejność">
            ⠿
          </span>
        )}
        {checked && <span className="slot-number">{index + 1}.</span>}
      </div>
      <div className="program-info">
        <div className="program-name">{program.name}</div>
        <div className="program-meta">
          <span className="badge">Skok: {program.jumpAddr}</span>
          <span className="badge">{program.segments.length} segment{program.segments.length !== 1 ? 'ów' : ''}</span>
          <span className="badge">{totalKB} KB</span>
          {!program.available && <span className="badge unavail-badge">brak pliku binarnego</span>}
        </div>
        {program.segments.length > 1 && (
          <div className="segments">
            {program.segments.map((seg, i) => (
              <span key={i} className="seg-detail">
                {seg.destAddr} ({seg.lengthHex})
              </span>
            ))}
          </div>
        )}
        {program.segments.length === 1 && (
          <div className="segments">
            <span className="seg-detail">załaduj pod {program.segments[0].destAddr}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [programs, setPrograms] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loaderAvailable, setLoaderAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [building, setBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState(null);
  const [buildError, setBuildError] = useState(null);
  const [showEmulator, setShowEmulator] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    fetch(`${API}/programs`)
      .then(r => r.json())
      .then(data => {
        setPrograms(data.programs);
        setLoaderAvailable(data.loaderAvailable);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  function toggleProgram(id) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setBuildResult(null);
    setBuildError(null);
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSelectedIds(prev => {
        const oldIdx = prev.indexOf(active.id);
        const newIdx = prev.indexOf(over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }

  async function handleBuild() {
    setBuilding(true);
    setBuildResult(null);
    setBuildError(null);
    try {
      const res = await fetch(`${API}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedIds, fullRom: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBuildResult(data);
    } catch (err) {
      setBuildError(err.message);
    } finally {
      setBuilding(false);
    }
  }

  function handleDownload() {
    window.location.href = `${API}/download`;
  }

  // Build the ordered list: selected programs in selectedIds order, then unselected
  const selectedPrograms = selectedIds
    .map(id => programs.find(p => p.id === id))
    .filter(Boolean);
  const unselectedPrograms = programs.filter(p => !selectedIds.includes(p.id));

  const totalBytes = selectedPrograms.reduce(
    (sum, p) => sum + p.segments.reduce((s, seg) => s + seg.length, 0),
    0
  );
  const usedKB = (totalBytes / 1024).toFixed(1);
  const ROM_CONTENT_KB = 27.5; // ~$4800 to end of 32KB ROM
  const overLimit = totalBytes > ROM_CONTENT_KB * 1024;
  const usagePercent = Math.min(100, (totalBytes / (ROM_CONTENT_KB * 1024)) * 100).toFixed(1);

  if (loading) return <div className="center-msg">Ładowanie programów...</div>;
  if (error) return <div className="center-msg error">Błąd: {error}</div>;

  return (
    <>
    {showEmulator && <Emulator onClose={() => setShowEmulator(false)} selectedPrograms={selectedPrograms} />}
    <div className="app">
      <header>
        <div className="header-title">
          <span className="header-chip">A1C</span>
          <h1>Konfigurator Kartridżu Apple-1</h1>
        </div>
        <p className="header-sub">
          Select and order programs for your ROM image.
          {!loaderAvailable && (
            <span className="warn"> Nie znaleziono loadera — ROM będzie tylko z zawartością (uruchom <code>make</code> w repo).</span>
          )}
        </p>
      </header>

      <div className="main-layout">
        <section className="program-list">
          <h2>Dostępne programy</h2>

          {selectedPrograms.length > 0 && (
            <>
              <div className="section-label">Zaznaczone (przeciągnij, aby zmienić kolejność)</div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={selectedIds} strategy={verticalListSortingStrategy}>
                  {selectedPrograms.map((p, i) => (
                    <SortableProgram
                      key={p.id}
                      program={p}
                      checked={true}
                      onToggle={toggleProgram}
                      index={i}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </>
          )}

          {unselectedPrograms.length > 0 && (
            <>
              {selectedPrograms.length > 0 && <div className="section-label unsel-label">Niezaznaczone</div>}
              {unselectedPrograms.map(p => (
                <SortableProgram
                  key={p.id}
                  program={p}
                  checked={false}
                  onToggle={toggleProgram}
                  index={-1}
                />
              ))}
            </>
          )}
        </section>

        <aside className="sidebar">
          <div className="summary-card">
            <h2>Podsumowanie ROM</h2>
            <div className="summary-row">
              <span>Zaznaczone programy</span>
              <strong>{selectedIds.length} / {programs.length}</strong>
            </div>
            <div className="summary-row">
              <span>Rozmiar zawartości</span>
              <strong>{usedKB} KB</strong>
            </div>
            <div className="usage-bar-wrap">
              <div className="usage-bar" style={{ width: `${usagePercent}%`, background: overLimit ? '#c05050' : undefined }} />
            </div>
            <div className="usage-label" style={{ color: overLimit ? '#c05050' : undefined }}>
              {usagePercent}% of available ROM space
            </div>

            {selectedIds.length > 0 && (
              <div className="order-list">
                <div className="section-label">Kolejność wczytywania</div>
                {selectedPrograms.map((p, i) => (
                  <div key={p.id} className="order-item">
                    <span className="order-num">{i + 1}</span>
                    <span>{p.name}</span>
                  </div>
                ))}
              </div>
            )}

            {overLimit && (
              <div className="over-limit-msg">
                Wybrane programy przekraczają dostępną pamięć ROM. Odznacz kilka programów.
              </div>
            )}
            <button
              className="btn-build"
              disabled={selectedIds.length === 0 || building || overLimit}
              onClick={handleBuild}
            >
              {building ? 'Budowanie...' : 'Zbuduj ROM'}
            </button>

            {buildResult && (
              <div className="build-success">
                <div>Built: <strong>{buildResult.filename}</strong></div>
                <div>{(buildResult.size / 1024).toFixed(1)} KB &bull; {buildResult.programCount} program{buildResult.programCount !== 1 ? 's' : ''}</div>
                <button className="btn-download" onClick={handleDownload}>
                  Pobierz {buildResult.filename}
                </button>
                <button className="btn-emulate" onClick={() => setShowEmulator(true)}>
                  ▶ Test w emulatorze
                </button>
              </div>
            )}

            {buildError && (
              <div className="build-error">
                <strong>Build failed:</strong> {buildError}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
    </>
  );
}
