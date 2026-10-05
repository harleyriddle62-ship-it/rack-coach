/* =========================================================
   RACK COACH
   Offline-first APA Captain's Assistant
   Version 0.2
   ========================================================= */

(() => {
  "use strict";

  const STORAGE_KEY = "rackCoach.v2";

  const $ = (id) => document.getElementById(id);

  const uid = (prefix = "id") =>
    `${prefix}_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  /* =========================================================
     DATA
     ========================================================= */

  function blankState() {
    return {
      version: 2,
      currentTeamId: null,

      teams: [],

      players: [],

      matches: [],

      /*
        Future matchup history structure:

        {
          playerId,
          opponentPlayerId,
          result: "win" | "loss",
          format: "9-ball" | "8-ball",
          date
        }
      */

      matchups: []
    };
  }

  let state = loadState();

  let currentMatchId = null;
  let editingTeamId = null;
  let editingPlayerId = null;

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (!saved) {
        return blankState();
      }

      return Object.assign(blankState(), JSON.parse(saved));
    } catch (error) {
      console.error("Could not load Rack Coach data:", error);
      return blankState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /* =========================================================
     HELPERS
     ========================================================= */

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char];
    });
  }

  function getTeam(teamId) {
    return state.teams.find((team) => team.id === teamId);
  }

  function getPlayer(playerId) {
    return state.players.find((player) => player.id === playerId);
  }

  function getTeamPlayers(teamId, activeOnly = false) {
    return state.players.filter((player) => {
      if (player.teamId !== teamId) return false;

      if (activeOnly && player.status === "inactive") {
        return false;
      }

      return true;
    });
  }

  function getCurrentTeamId() {
    if (
      state.currentTeamId &&
      state.teams.some((team) => team.id === state.currentTeamId)
    ) {
      return state.currentTeamId;
    }

    return state.teams[0]?.id || null;
  }

  function setCurrentTeam(teamId) {
    state.currentTeamId = teamId;
    saveState();
    renderAll();
  }

  function formatDate(dateString) {
    if (!dateString) return "—";

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return dateString;
    }

    return date.toLocaleString();
  }

  function localDateTime() {
    const date = new Date();

    date.setMinutes(
      date.getMinutes() - date.getTimezoneOffset()
    );

    return date.toISOString().slice(0, 16);
  }

  /* =========================================================
     NAVIGATION
     ========================================================= */

  function showSection(sectionName) {
    document
      .querySelectorAll(".section")
      .forEach((section) => {
        section.classList.toggle(
          "active",
          section.id === `${sectionName}-section`
        );
      });

    document
      .querySelectorAll(".nav-btn")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.section === sectionName
        );
      });

    if (sectionName === "teams") renderTeams();
    if (sectionName === "players") renderPlayers();
    if (sectionName === "matches") renderMatches();
    if (sectionName === "stats") renderStats();
  }

  /* =========================================================
     TEAM SELECTS
     ========================================================= */

  function populateTeamSelects() {
    const selects = [
      $("teamSelect"),
      $("matchTeamSelect"),
      $("statsTeamSelect")
    ];

    selects.forEach((select) => {
      if (!select) return;

      const oldValue =
        select.value ||
        getCurrentTeamId() ||
        "";

      if (!state.teams.length) {
        select.innerHTML =
          `<option value="">No teams yet</option>`;
        return;
      }

      select.innerHTML = state.teams
        .map(
          (team) =>
            `<option value="${team.id}">
              ${escapeHtml(team.name)}
            </option>`
        )
        .join("");

      if (
        state.teams.some(
          (team) => team.id === oldValue
        )
      ) {
        select.value = oldValue;
      } else {
        select.value = state.teams[0].id;
      }
    });
  }

  /* =========================================================
     TEAMS
     ========================================================= */

  function renderTeams() {
    const container = $("teams-list");

    if (!container) return;

    if (!state.teams.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No teams yet</h3>
          <p>Create your first team to start building your captain's binder.</p>
        </div>
      `;

      return;
    }

    container.innerHTML = state.teams
      .map((team) => {
        const players = getTeamPlayers(team.id);
        const activePlayers = getTeamPlayers(team.id, true);

        return `
          <div class="card team-card">

            <div class="card-header">
              <h3>${escapeHtml(team.name)}</h3>

              <span class="badge">
                ${activePlayers.length} active
              </span>
            </div>

            <p>
              <strong>Captain:</strong>
              ${escapeHtml(team.captain || "—")}
            </p>

            ${
              team.captainContact
                ? `
                  <p>
                    <strong>Contact:</strong>
                    ${escapeHtml(team.captainContact)}
                  </p>
                `
                : ""
            }

            <p>
              ${players.length}
              rostered player${players.length === 1 ? "" : "s"}
            </p>

            <div class="form-actions">

              <button
                class="btn btn-primary"
                data-action="use-team"
                data-id="${team.id}">
                Open Team
              </button>

              <button
                class="btn btn-secondary"
                data-action="edit-team"
                data-id="${team.id}">
                Edit
              </button>

            </div>

          </div>
        `;
      })
      .join("");
  }

  function resetTeamForm() {
    $("teamForm")?.reset();

    editingTeamId = null;

    if ($("teamModalTitle")) {
      $("teamModalTitle").textContent = "New Team";
    }
  }

  function openTeamEditor(teamId = null) {
    resetTeamForm();

    if (teamId) {
      const team = getTeam(teamId);

      if (!team) return;

      editingTeamId = teamId;

      $("teamModalTitle").textContent = "Edit Team";

      $("teamName").value = team.name || "";
      $("captainName").value = team.captain || "";
      $("captainContact").value =
        team.captainContact || "";
    }

    openModal("teamModal");
  }

  function saveTeam(event) {
    event.preventDefault();

    const name = $("teamName").value.trim();
    const captain = $("captainName").value.trim();
    const captainContact =
      $("captainContact").value.trim();

    if (!name || !captain) {
      alert("Team name and captain are required.");
      return;
    }

    if (editingTeamId) {
      const team = getTeam(editingTeamId);

      if (team) {
        team.name = name;
        team.captain = captain;
        team.captainContact = captainContact;
      }
    } else {
      const team = {
        id: uid("team"),
        name,
        captain,
        captainContact,
        createdAt: new Date().toISOString()
      };

      state.teams.push(team);

      state.currentTeamId = team.id;
    }

    saveState();

    closeModal("teamModal");

    renderAll();
  }

  /* =========================================================
     PLAYERS
     ========================================================= */

  function renderPlayers() {
    const container = $("players-list");

    if (!container) return;

    const teamId =
      $("teamSelect")?.value ||
      getCurrentTeamId();

    if (!teamId) {
      container.innerHTML = `
        <div class="empty-state">
          <p>Create a team first.</p>
        </div>
      `;

      return;
    }

    const players = getTeamPlayers(teamId);

    if (!players.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No players</h3>
          <p>Add your roster and APA skill levels.</p>
        </div>
      `;

      return;
    }

    container.innerHTML = players
      .map(
        (player) => `
          <div class="card player-card">

            <div class="card-header">

              <h3>
                ${escapeHtml(player.name)}
              </h3>

              <span class="badge">
                SL ${player.skillLevel}
              </span>

            </div>

            <p>
              <strong>Status:</strong>
              ${escapeHtml(player.status)}
            </p>

            ${
              player.strengths
                ? `
                  <p>
                    <strong>Strengths:</strong>
                    ${escapeHtml(player.strengths)}
                  </p>
                `
                : ""
            }

            ${
              player.weaknesses
                ? `
                  <p>
                    <strong>Watch:</strong>
                    ${escapeHtml(player.weaknesses)}
                  </p>
                `
                : ""
            }

            ${
              player.coachingNotes
                ? `
                  <p>
                    <strong>Coach:</strong>
                    ${escapeHtml(player.coachingNotes)}
                  </p>
                `
                : ""
            }

            <div class="form-actions">

              <button
                class="btn btn-secondary"
                data-action="edit-player"
                data-id="${player.id}">
                Edit
              </button>

            </div>

          </div>
        `
      )
      .join("");
  }

  function openPlayerEditor(playerId = null) {
    $("playerForm")?.reset();

    editingPlayerId = null;

    $("playerModalTitle").textContent =
      "Add Player";

    if (playerId) {
      const player = getPlayer(playerId);

      if (!player) return;

      editingPlayerId = playerId;

      $("playerModalTitle").textContent =
        "Edit Player";

      $("playerName").value =
        player.name || "";

      $("skillLevel").value =
        player.skillLevel || "";

      $("playerStatus").value =
        player.status || "active";

      $("playerContact").value =
        player.contact || "";

      $("coachingNotes").value =
        player.coachingNotes || "";

      $("strengths").value =
        player.strengths || "";

      $("weaknesses").value =
        player.weaknesses || "";
    }

    openModal("playerModal");
  }

  function savePlayer(event) {
    event.preventDefault();

    const teamId =
      $("teamSelect").value ||
      getCurrentTeamId();

    if (!teamId) {
      alert("Create a team first.");
      return;
    }

    const name =
      $("playerName").value.trim();

    const skillLevel =
      Number($("skillLevel").value);

    if (!name || !skillLevel) {
      alert("Player name and skill level are required.");
      return;
    }

    const playerData = {
      teamId,
      name,
      skillLevel,
      status:
        $("playerStatus").value || "active",
      contact:
        $("playerContact").value.trim(),
      coachingNotes:
        $("coachingNotes").value.trim(),
      strengths:
        $("strengths").value.trim(),
      weaknesses:
        $("weaknesses").value.trim()
    };

    if (editingPlayerId) {
      const player =
        getPlayer(editingPlayerId);

      if (player) {
        Object.assign(player, playerData);
      }
    } else {
      state.players.push({
        id: uid("player"),
        ...playerData,
        createdAt: new Date().toISOString()
      });
    }

    saveState();

    closeModal("playerModal");

    renderAll();
  }

  /* =========================================================
     MATCHES
     ========================================================= */

  function createMatch(event) {
    event.preventDefault();

    const teamId =
      $("matchTeamSelect").value ||
      getCurrentTeamId();

    if (!teamId) {
      alert("Create a team first.");
      return;
    }

    const opponent =
      $("opponent").value.trim();

    if (!opponent) {
      alert("Opponent team is required.");
      return;
    }

    const match = {
      id: uid("match"),

      teamId,

      date: $("matchDate").value,

      opponent,

      location:
        $("location").value.trim(),

      format:
        $("format").value,

      coinToss: "",

      deferDecision: "",

      opponentPlayers: [],

      lineup: [],

      results: [],

      notes: "",

      createdAt:
        new Date().toISOString()
    };

    state.matches.push(match);

    saveState();

    $("matchForm").reset();

    closeModal("matchModal");

    openMatch(match.id);
  }

  function renderMatches() {
    const container = $("matches-list");

    if (!container) return;

    const teamId =
      $("matchTeamSelect")?.value ||
      getCurrentTeamId();

    const matches = state.matches
      .filter(
        (match) => match.teamId === teamId
      )
      .sort(
        (a, b) =>
          new Date(b.date) -
          new Date(a.date)
      );

    if (!matches.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No matches</h3>
          <p>
            Create tonight's match and build the lineup.
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML = matches
      .map((match) => {
        const wins =
          match.results?.filter(
            (result) =>
              result.result === "win"
          ).length || 0;

        const losses =
          match.results?.filter(
            (result) =>
              result.result === "loss"
          ).length || 0;

        return `
          <div class="card match-card">

            <div class="card-header">

              <h3>
                ${escapeHtml(match.opponent)}
              </h3>

              <span class="badge">
                ${escapeHtml(match.format)}
              </span>

            </div>

            <p>
              ${formatDate(match.date)}
            </p>

            <p>
              ${escapeHtml(
                match.location ||
                "Location not set"
              )}
            </p>

            <p>
              Recorded:
              ${wins}-${losses}
            </p>

            ${
              match.lineup?.length
                ? `
                  <p>
                    Lineup:
                    ${match.lineup.length}/5
                  </p>
                `
                : ""
            }

            <button
              class="btn btn-primary"
              data-action="open-match"
              data-id="${match.id}">
              Open Match
            </button>

          </div>
        `;
      })
      .join("");
  }

  /* =========================================================
     23 RULE
     ========================================================= */

  function check23Rule(players) {
    const uniquePlayers = [
      ...new Map(
        players.map(
          (player) => [player.id, player]
        )
      ).values()
    ];

    const totalSkill = uniquePlayers.reduce(
      (total, player) =>
        total + Number(player.skillLevel || 0),
      0
    );

    return {
      count: uniquePlayers.length,
      total: totalSkill,
      legal:
        uniquePlayers.length === 5 &&
        totalSkill <= 23
    };
  }

  function getLineupPlayers(match) {
    const teamPlayers =
      getTeamPlayers(match.teamId, true);

    return (match.lineup || [])
      .map(
        (entry) =>
          teamPlayers.find(
            (player) =>
              player.id === entry.playerId
          )
      )
      .filter(Boolean);
  }

  /* =========================================================
     MATCHUP INDEX
     ========================================================= */

  /*
    This is deliberately NOT presented as a guaranteed
    probability.

    It is a decision score.

    Future versions will add:

      - opponent-specific history
      - recent form
      - PPM
      - PA%
      - skill differential
      - safety performance
      - home/away
      - coin toss
      - expected opponent throw
      - player fatigue/availability
      - captain preference
  */

  function calculateMatchupScore(
    player,
    opponentPlayer = null
  ) {
    let score = 50;

    if (opponentPlayer) {
      const skillDifference =
        Number(player.skillLevel) -
        Number(opponentPlayer.skillLevel);

      score +=
        skillDifference * 7;
    } else {
      score +=
        Number(player.skillLevel) * 3;
    }

    const history =
      state.matchups.filter(
        (matchup) =>
          matchup.playerId === player.id &&
          (
            !opponentPlayer ||
            matchup.opponentPlayerId ===
              opponentPlayer.id
          )
      );

    if (history.length) {
      const wins =
        history.filter(
          (matchup) =>
            matchup.result === "win"
        ).length;

      const winRate =
        wins / history.length;

      score +=
        (winRate - 0.5) * 24;
    }

    const playerResults =
      state.matches
        .flatMap(
          (match) =>
            match.results || []
        )
        .filter(
          (result) =>
            result.playerId ===
            player.id
        )
        .slice(-6);

    if (playerResults.length) {
      const wins =
        playerResults.filter(
          (result) =>
            result.result === "win"
        ).length;

      const formRate =
        wins /
        playerResults.length;

      score +=
        (formRate - 0.5) * 10;
    }

    return Math.max(
      0,
      Math.min(100, score)
    );
  }

  function buildMatchupRecommendations(match) {
    const players =
      getTeamPlayers(
        match.teamId,
        true
      );

    const opponentPlayers =
      match.opponentPlayers || [];

    const recommendations = [];

    players.forEach((player) => {
      if (opponentPlayers.length) {
        opponentPlayers.forEach(
          (opponent) => {
            recommendations.push({
              player,
              opponent,
              score:
                calculateMatchupScore(
                  player,
                  opponent
                )
            });
          }
        );
      } else {
        recommendations.push({
          player,
          opponent: null,
          score:
            calculateMatchupScore(
              player
            )
        });
      }
    });

    return recommendations.sort(
      (a, b) =>
        b.score - a.score
    );
  }

  /* =========================================================
     LINEUP BUILDER
     ========================================================= */

  function renderLineup(match) {
    const container =
      $("lineupForm");

    if (!container) return;

    const players =
      getTeamPlayers(
        match.teamId,
        true
      );

    const selectedIds =
      new Set(
        (match.lineup || [])
          .map(
            (entry) =>
              entry.playerId
          )
      );

    const selectedPlayers =
      players.filter(
        (player) =>
          selectedIds.has(player.id)
      );

    const rule =
      check23Rule(
        selectedPlayers
      );

    const recommendations =
      buildMatchupRecommendations(
        match
      );

    container.innerHTML = `

      <div class="card">

        <h3>23-Rule Calculator</h3>

        <p>
          Players:
          <strong>
            ${rule.count}/5
          </strong>
        </p>

        <p>
          Skill total:
          <strong>
            ${rule.total}
          </strong>
          / 23
        </p>

        <p>
          Status:
          <span class="badge">
            ${
              rule.legal
                ? "LEGAL"
                : "NOT LEGAL YET"
            }
          </span>
        </p>

        <div class="player-select-list">

          ${players
            .map(
              (player) => `
                <label class="player-select">

                  <input
                    type="checkbox"
                    data-lineup-player="${player.id}"
                    ${
                      selectedIds.has(
                        player.id
                      )
                        ? "checked"
                        : ""
                    }
                  >

                  <span>
                    ${escapeHtml(
                      player.name
                    )}
                    · SL
                    ${player.skillLevel}
                  </span>

                </label>
              `
            )
            .join("")}

        </div>

      </div>

      <div class="card">

        <h3>
          Captain Matchup Index
        </h3>

        <p>
          These are decision scores,
          not guaranteed win percentages.
        </p>

        ${
          recommendations.length
            ? recommendations
                .slice(0, 10)
                .map(
                  (recommendation) => `
                    <div class="stat-row">

                      <strong>
                        ${escapeHtml(
                          recommendation
                            .player.name
                        )}
                      </strong>

                      <span>
                        ${
                          recommendation
                            .opponent
                            ? escapeHtml(
                                recommendation
                                  .opponent
                                  .name
                              )
                            : "Opponent unknown"
                        }
                      </span>

                      <span>
                        ${recommendation.score.toFixed(
                          0
                        )}
                      </span>

                    </div>
                  `
                )
                .join("")
            : "<p>No recommendations yet.</p>"
        }

      </div>
    `;

    container
      .querySelectorAll(
        "[data-lineup-player]"
      )
      .forEach((checkbox) => {
        checkbox.addEventListener(
          "change",
          () => {
            match.lineup = [
              ...container.querySelectorAll(
                "[data-lineup-player]:checked"
              )
            ].map(
              (input) => ({
                playerId:
                  input.dataset
                    .lineupPlayer
              })
            );

            saveState();

            renderLineup(match);
          }
        );
      });
  }

  /* =========================================================
     SCORING
     ========================================================= */

  function renderScoring(match) {
    const container =
      $("scoringForm");

    if (!container) return;

    const players =
      getTeamPlayers(
        match.teamId,
        true
      );

    if (!match.results) {
      match.results = [];
    }

    container.innerHTML = `
      <div class="card">

        ${players
          .map((player) => {
            const result =
              match.results.find(
                (entry) =>
                  entry.playerId ===
                  player.id
              ) || {};

            return `
              <div class="stat-row">

                <strong>
                  ${escapeHtml(
                    player.name
                  )}
                </strong>

                <select
                  data-result-player="${player.id}"
                >
                  <option value="">
                    —
                  </option>

                  <option
                    value="win"
                    ${
                      result.result ===
                      "win"
                        ? "selected"
                        : ""
                    }
                  >
                    Win
                  </option>

                  <option
                    value="loss"
                    ${
                      result.result ===
                      "loss"
                        ? "selected"
                        : ""
                    }
                  >
                    Loss
                  </option>

                </select>

                <input
                  type="number"
                  min="0"
                  max="50"
                  placeholder="PPM"
                  value="${
                    result.ppm ?? ""
                  }"
                  data-ppm-player="${player.id}"
                  style="max-width:90px"
                >

              </div>
            `;
          })
          .join("")}

      </div>
    `;

    container
      .querySelectorAll(
        "[data-result-player]"
      )
      .forEach((select) => {
        select.addEventListener(
          "change",
          () => {
            const playerId =
              select.dataset
                .resultPlayer;

            let result =
              match.results.find(
                (entry) =>
                  entry.playerId ===
                  playerId
              );

            if (!result) {
              result = {
                playerId
              };

              match.results.push(
                result
              );
            }

            result.result =
              select.value;

            saveState();
          }
        );
      });

    container
      .querySelectorAll(
        "[data-ppm-player]"
      )
      .forEach((input) => {
        input.addEventListener(
          "change",
          () => {
            const playerId =
              input.dataset
                .ppmPlayer;

            let result =
              match.results.find(
                (entry) =>
                  entry.playerId ===
                  playerId
              );

            if (!result) {
              result = {
                playerId
              };

              match.results.push(
                result
              );
            }

            result.ppm =
              input.value === ""
                ? null
                : Number(input.value);

            saveState();
          }
        );
      });
  }

  /* =========================================================
     MATCH DETAIL
     ========================================================= */

  function openMatch(matchId) {
    const match =
      state.matches.find(
        (item) =>
          item.id === matchId
      );

    if (!match) return;

    currentMatchId =
      matchId;

    $("matchDetailTitle").textContent =
      `${match.opponent} · ${match.format}`;

    $("matchNotes").value =
      match.notes || "";

    renderLineup(match);

    renderScoring(match);

    openModal(
      "matchDetailModal"
    );
  }

  /* =========================================================
     STATS
     ========================================================= */

  function calculatePlayerStats(
    teamId
  ) {
    return getTeamPlayers(
      teamId
    ).map((player) => {
      const results =
        state.matches
          .flatMap(
            (match) =>
              match.results || []
          )
          .filter(
            (result) =>
              result.playerId ===
              player.id
          );

      const wins =
        results.filter(
          (result) =>
            result.result ===
            "win"
        ).length;

      const losses =
        results.filter(
          (result) =>
            result.result ===
            "loss"
        ).length;

      const ppmValues =
        results
          .map(
            (result) =>
              Number(result.ppm)
          )
          .filter(
            (value) =>
              Number.isFinite(value)
          );

      const ppm =
        ppmValues.length
          ? ppmValues.reduce(
              (a, b) => a + b,
              0
            ) /
            ppmValues.length
          : 0;

      return {
        player,
        wins,
        losses,
        played:
          wins + losses,
        winPct:
          wins + losses
            ? (wins /
                (wins + losses)) *
              100
            : 0,
        ppm
      };
    });
  }

  function renderStats() {
    const container =
      $("stats-content");

    if (!container) return;

    const teamId =
      $("statsTeamSelect")?.value ||
      getCurrentTeamId();

    if (!teamId) {
      container.innerHTML = `
        <div class="empty-state">
          <p>Create a team first.</p>
        </div>
      `;

      return;
    }

    const stats =
      calculatePlayerStats(
        teamId
      );

    const totalWins =
      stats.reduce(
        (total, player) =>
          total + player.wins,
        0
      );

    const totalMatches =
      stats.reduce(
        (total, player) =>
          total + player.played,
        0
      );

    container.innerHTML = `

      <div class="card">

        <h3>
          Team Snapshot
        </h3>

        <div class="stats-grid">

          <div>
            <strong>
              ${totalWins}
            </strong>
            <small>
              Individual wins
            </small>
          </div>

          <div>
            <strong>
              ${totalMatches}
            </strong>
            <small>
              Individual matches
            </small>
          </div>

          <div>
            <strong>
              ${
                getTeamPlayers(
                  teamId,
                  true
                ).length
              }
            </strong>
            <small>
              Active players
            </small>
          </div>

        </div>

      </div>

      <div class="card">

        <h3>
          Player Form
        </h3>

        ${
          stats.length
            ? stats
                .map(
                  (stat) => `
                    <div class="stat-row">

                      <strong>
                        ${escapeHtml(
                          stat.player
                            .name
                        )}
                      </strong>

                      <span>
                        SL
                        ${stat.player.skillLevel}
                      </span>

                      <span>
                        ${stat.wins}-${stat.losses}
                      </span>

                      <span>
                        ${stat.winPct.toFixed(
                          0
                        )}%
                      </span>

                      <span>
                        PPM
                        ${
                          stat.ppm
                            ? stat.ppm.toFixed(
                                2
                              )
                            : "—"
                        }
                      </span>

                    </div>
                  `
                )
                .join("")
            : "<p>No players yet.</p>"
        }

      </div>
    `;
  }

  /* =========================================================
     MODALS
     ========================================================= */

  function openModal(id) {
    $(id)?.classList.add(
      "active"
    );
  }

  function closeModal(id) {
    $(id)?.classList.remove(
      "active"
    );
  }

  /* =========================================================
     EXPORT / IMPORT
     ========================================================= */

  function exportBackup() {
    const blob =
      new Blob(
        [
          JSON.stringify(
            state,
            null,
            2
          )
        ],
        {
          type:
            "application/json"
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href = url;

    link.download =
      `rack-coach-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;

    link.click();

    URL.revokeObjectURL(
      url
    );
  }

  function importBackup(event) {
    const file =
      event.target.files?.[0];

    if (!file) return;

    const reader =
      new FileReader();

    reader.onload = () => {
      try {
        const imported =
          JSON.parse(
            reader.result
          );

        if (
          !Array.isArray(
            imported.teams
          ) ||
          !Array.isArray(
            imported.players
          ) ||
          !Array.isArray(
            imported.matches
          )
        ) {
          throw new Error(
            "Invalid Rack Coach backup."
          );
        }

        state =
          Object.assign(
            blankState(),
            imported
          );

        saveState();

        renderAll();

        alert(
          "Rack Coach backup imported successfully."
        );
      } catch (error) {
        alert(
          `Could not import backup: ${error.message}`
        );
      }
    };

    reader.readAsText(
      file
    );

    event.target.value = "";
  }

  /* =========================================================
     EVENT WIRING
     ========================================================= */

  function wireEvents() {

    document
      .querySelectorAll(
        ".nav-btn"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            showSection(
              button.dataset
                .section
            )
        );
      });

    $("newTeamBtn")
      ?.addEventListener(
        "click",
        () =>
          openTeamEditor()
      );

    $("newPlayerBtn")
      ?.addEventListener(
        "click",
        () =>
          openPlayerEditor()
      );

    $("newMatchBtn")
      ?.addEventListener(
        "click",
        () => {
          $("matchForm")
            ?.reset();

          $("matchDate").value =
            localDateTime();

          openModal(
            "matchModal"
          );
        }
      );

    $("teamSelect")
      ?.addEventListener(
        "change",
        (event) => {
          setCurrentTeam(
            event.target.value
          );
          renderPlayers();
        }
      );

    $("matchTeamSelect")
      ?.addEventListener(
        "change",
        (event) => {
          setCurrentTeam(
            event.target.value
          );
          renderMatches();
        }
      );

    $("statsTeamSelect")
      ?.addEventListener(
        "change",
        (event) => {
          setCurrentTeam(
            event.target.value
          );
          renderStats();
        }
      );

    $("teamForm")
      ?.addEventListener(
        "submit",
        saveTeam
      );

    $("playerForm")
      ?.addEventListener(
        "submit",
        savePlayer
      );

    $("matchForm")
      ?.addEventListener(
        "submit",
        createMatch
      );

    $("teamModalClose")
      ?.addEventListener(
        "click",
        () =>
          closeModal(
            "teamModal"
          )
      );

    $("playerModalClose")
      ?.addEventListener(
        "click",
        () =>
          closeModal(
            "playerModal"
          )
      );

    $("matchModalClose")
      ?.addEventListener(
        "click",
        () =>
          closeModal(
            "matchModal"
          )
      );

    $("matchDetailClose")
      ?.addEventListener(
        "click",
        () =>
          closeModal(
            "matchDetailModal"
          )
      );

    $("saveMatchBtn")
      ?.addEventListener(
        "click",
        () => {
          const match =
            state.matches.find(
              (item) =>
                item.id ===
                currentMatchId
            );

          if (match) {
            match.notes =
              $("matchNotes")
                .value;

            saveState();
          }

          closeModal(
            "matchDetailModal"
          );

          renderMatches();
        }
      );

    $("matchNotes")
      ?.addEventListener(
        "input",
        () => {
          const match =
            state.matches.find(
              (item) =>
                item.id ===
                currentMatchId
            );

          if (!match) return;

          match.notes =
            $("matchNotes")
              .value;

          saveState();
        }
      );

    $("exportBtn")
      ?.addEventListener(
        "click",
        exportBackup
      );

    $("importBtn")
      ?.addEventListener(
        "click",
        () =>
          $("importFile")
            ?.click()
      );

    $("importFile")
      ?.addEventListener(
        "change",
        importBackup
      );

    /*
      Team cards
    */

    $("teams-list")
      ?.addEventListener(
        "click",
        (event) => {
          const button =
            event.target.closest(
              "[data-action]"
            );

          if (!button) return;

          const action =
            button.dataset.action;

          const id =
            button.dataset.id;

          if (
            action ===
            "use-team"
          ) {
            setCurrentTeam(id);

            showSection(
              "players"
            );
          }

          if (
            action ===
            "edit-team"
          ) {
            openTeamEditor(id);
          }
        }
      );

    /*
      Player cards
    */

    $("players-list")
      ?.addEventListener(
        "click",
        (event) => {
          const button =
            event.target.closest(
              "[data-action]"
            );

          if (
            button?.dataset
              .action ===
            "edit-player"
          ) {
            openPlayerEditor(
              button.dataset.id
            );
          }
        }
      );

    /*
      Match cards
    */

    $("matches-list")
      ?.addEventListener(
        "click",
        (event) => {
          const button =
            event.target.closest(
              "[data-action]"
            );

          if (
            button?.dataset
              .action ===
            "open-match"
          ) {
            openMatch(
              button.dataset.id
            );
          }
        }
      );

    /*
      Modal background closing
    */

    document
      .querySelectorAll(
        ".modal"
      )
      .forEach((modal) => {
        modal.addEventListener(
          "click",
          (event) => {
            if (
              event.target ===
              modal
            ) {
              modal.classList.remove(
                "active"
              );
            }
          }
        );
      });

    /*
      X buttons
    */

    document
      .querySelectorAll(
        ".modal-close"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            button
              .closest(
                ".modal"
              )
              ?.classList.remove(
                "active"
              );
          }
        );
      });

    /*
      Match tabs
    */

    document
      .querySelectorAll(
        ".tab-btn"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            const tab =
              button.dataset
                .tab;

            document
              .querySelectorAll(
                ".tab-btn"
              )
              .forEach(
                (item) =>
                  item.classList.toggle(
                    "active",
                    item ===
                      button
                  )
              );

            document
              .querySelectorAll(
                ".tab-content"
              )
              .forEach(
                (item) =>
                  item.classList.toggle(
                    "active",
                    item.id ===
                      `${tab}-tab`
                  )
              );
          }
        );
      });
  }

  /* =========================================================
     RENDER
     ========================================================= */

  function renderAll() {
    populateTeamSelects();

    renderTeams();

    renderPlayers();

    renderMatches();

    renderStats();
  }

  /* =========================================================
     START
     ========================================================= */

  wireEvents();

  renderAll();

  /*
    Public diagnostic API.

    Useful later for automated testing and
    the Captain Matchup Index.
  */

  window.RackCoach = {

    getState() {
      return structuredClone(
        state
      );
    },

    check23(
      teamId,
      playerIds
    ) {
      const players =
        getTeamPlayers(
          teamId
        ).filter(
          (player) =>
            playerIds.includes(
              player.id
            )
        );

      return check23Rule(
        players
      );
    },

    matchupScore:
      calculateMatchupScore,

    save() {
      saveState();
    }

  };

})();