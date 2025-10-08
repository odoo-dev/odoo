import { Message } from "@mail/core/common/message";
import { MessageSeenIndicator } from "@mail/discuss/core/common/message_seen_indicator";
import { Poll } from "@mail/core/common/poll";
import { PollResult } from "@mail/core/common/poll_result";

Message.components = { ...Message.components, MessageSeenIndicator, Poll, PollResult };
