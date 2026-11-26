import { ColorResolvable } from "discord.js";
import { interactionCommandType } from "../../types/types/interactionCommandType.js";
import { EmptyEmbed, replyEmbed } from "../../utils/messages.js";
import type { BClient } from "../client/BClient.js";
import { textsFor, type Texts } from "../../i18n/index.js";

/** Aviso efímero de los chequeos de voz, en el idioma del servidor */
async function warn(inter: interactionCommandType, text: (t: Texts) => string, color?: ColorResolvable) {
    const t = await textsFor(inter.client as BClient, inter.guildId);
    const embed = EmptyEmbed({ description: text(t) });
    if (color) embed.setColor(color);
    return replyEmbed({ interaction: inter, embed, ephemeral: true });
}

export const warnNoChannelAcces = (inter: interactionCommandType) => warn(inter, t => t.voice.noChannelAccess);
export const warnJoinToVC = (inter: interactionCommandType) => warn(inter, t => t.voice.joinVC, "Yellow");
export const warnNothingFound = (inter: interactionCommandType) => warn(inter, t => t.play.noResults, "Yellow");
export const warnJoinToVCBut = (inter: interactionCommandType) => warn(inter, t => t.voice.joinedRetry, "Yellow");
export const warnNeedSameVC = (inter: interactionCommandType) => warn(inter, t => t.voice.needSameVC, "Yellow");
