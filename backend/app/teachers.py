"""Single source of truth for the seven Axiom teachers."""
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class Teacher:
    id: str
    name: str
    role: str
    avatar: str
    color: str
    bg: str
    border: str
    system: str
    prompt: Callable[[str], str]


TEACHERS: list[Teacher] = [
    Teacher(
        id="anchor",
        name="Dr. Foundations",
        role="The Definer",
        avatar="DF",
        color="#5B4FE8",
        bg="#F0EFFE",
        border="#C4BFFA",
        system=(
            "You are a precise academic who defines things from first principles. "
            "No jargon without explanation. Build definition layer by layer. "
            "3-4 sentences. Authoritative but warm. Use markdown."
        ),
        prompt=lambda t: f"Define the core concept and first principles of: {t}. Be precise and clear.",
    ),
    Teacher(
        id="analogy",
        name="Sam Bridges",
        role="The Analogist",
        avatar="SB",
        color="#0D9E75",
        bg="#E1F5EE",
        border="#9FE1CB",
        system=(
            "You explain everything through vivid unexpected analogies. Never explain "
            "directly — always through comparison to something everyday. 2-3 sentences. "
            "Be surprising. Use markdown."
        ),
        prompt=lambda t: f"Create one vivid unexpected analogy that captures the essence of: {t}.",
    ),
    Teacher(
        id="historian",
        name="Prof. Roots",
        role="The Historian",
        avatar="PR",
        color="#C8860A",
        bg="#FEF3DA",
        border="#FAC775",
        system=(
            "You reveal the surprising human story behind every idea. Find the "
            "discovery moment, who got it wrong first. 3-4 sentences. Make history "
            "feel alive. Use markdown."
        ),
        prompt=lambda t: (
            f"Tell the surprising human and historical story behind: {t}. "
            "Include a specific person or moment most don't know."
        ),
    ),
    Teacher(
        id="challenger",
        name="Dr. Devil",
        role="The Challenger",
        avatar="DD",
        color="#D03030",
        bg="#FEECEC",
        border="#F09595",
        system=(
            "You are a Socratic challenger. Surface where consensus breaks down, the "
            "hardest open questions. Not cynical — rigorously honest. 2-3 sentences. "
            "End with a genuine open question. Use markdown."
        ),
        prompt=lambda t: f"What is the hardest question or most contested assumption about: {t}? Be genuinely challenging.",
    ),
    Teacher(
        id="connector",
        name="Mx. Links",
        role="The Connector",
        avatar="ML",
        color="#1A6FC4",
        bg="#E6F1FB",
        border="#85B7EB",
        system=(
            "You see connections between fields. Link every concept to 2-3 surprising "
            "adjacent ideas in other domains. Specific about WHY the connection "
            "illuminates. 3-4 sentences. Use markdown."
        ),
        prompt=lambda t: f"What are 2-3 surprising connections between {t} and other fields? Explain concretely why each connection matters.",
    ),
    Teacher(
        id="practical",
        name="Alex Applies",
        role="The Practitioner",
        avatar="AA",
        color="#2D7D46",
        bg="#EAF5ED",
        border="#97C459",
        system=(
            "You only care about application. Give one concrete specific actionable way "
            "to use or experience this concept. 2-3 sentences. Very specific, not "
            "generic. Use markdown."
        ),
        prompt=lambda t: f"Give one concrete specific actionable way to apply or experience {t} in daily life or work.",
    ),
    Teacher(
        id="quiz",
        name="Dr. Recall",
        role="The Examiner",
        avatar="DR",
        color="#6B5E45",
        bg="#F5F0E8",
        border="#D3C9B5",
        system=(
            "You design one brilliant question that tests deep understanding, not "
            "surface knowledge. Then one sentence hint about what a good answer "
            "reveals. Use markdown."
        ),
        prompt=lambda t: (
            f"Write ONE brilliant exam question about {t} that tests deep understanding. "
            "Then one sentence: what a good answer reveals."
        ),
    ),
]


def teacher_by_id(teacher_id: str) -> Teacher | None:
    return next((t for t in TEACHERS if t.id == teacher_id), None)


def teacher_meta() -> list[dict]:
    return [
        {
            "id": t.id,
            "name": t.name,
            "role": t.role,
            "avatar": t.avatar,
            "color": t.color,
            "bg": t.bg,
            "border": t.border,
        }
        for t in TEACHERS
    ]
