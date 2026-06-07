// Package ai proxies natural-language queries to configured AI providers.
package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Provider constants.
const (
	ProviderClaude  = "claude"
	ProviderOpenAI  = "openai"
	ProviderGemini  = "gemini"
	ProviderCopilot = "copilot"
)

// QueryRequest is sent from the frontend.
type QueryRequest struct {
	Provider string          `json:"provider"`
	Model    string          `json:"model"`
	APIKey   string          `json:"apiKey"`
	Messages []ChatMessage   `json:"messages"`
	Context  json.RawMessage `json:"context"` // optional RSOP result for context
}

// ChatMessage is a single turn in a conversation.
type ChatMessage struct {
	Role    string `json:"role"` // "user" | "assistant"
	Content string `json:"content"`
}

// QueryResponse is returned to the frontend.
type QueryResponse struct {
	Content string `json:"content"`
	Model   string `json:"model"`
}

var httpClient = &http.Client{Timeout: 60 * time.Second}

// Query routes the request to the appropriate AI provider.
func Query(req QueryRequest) (*QueryResponse, error) {
	// Prepend system context if RSOP data is provided.
	msgs := req.Messages
	if len(req.Context) > 2 {
		system := "You are an expert in Citrix Scout device configuration and thin-client management. " +
			"The user is analyzing RSOP (Resultant Set of Policy) data from a Scout Server. " +
			"The following JSON is the current RSOP analysis result:\n\n" + string(req.Context) + "\n\n" +
			"Help the user understand configuration differences, identify issues, and suggest improvements."
		msgs = append([]ChatMessage{{Role: "user", Content: system}, {Role: "assistant", Content: "Understood. I'm ready to help analyze this Scout RSOP configuration."}}, msgs...)
	}

	switch req.Provider {
	case ProviderClaude:
		return queryClaude(req.APIKey, req.Model, msgs)
	case ProviderOpenAI, ProviderCopilot:
		endpoint := "https://api.openai.com/v1/chat/completions"
		return queryOpenAI(req.APIKey, req.Model, msgs, endpoint)
	case ProviderGemini:
		return queryGemini(req.APIKey, req.Model, msgs)
	default:
		return nil, fmt.Errorf("unknown provider: %s", req.Provider)
	}
}

// --- Claude (Anthropic) ---

func queryClaude(apiKey, model string, msgs []ChatMessage) (*QueryResponse, error) {
	type anthropicMsg struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	var anthropicMsgs []anthropicMsg
	for _, m := range msgs {
		anthropicMsgs = append(anthropicMsgs, anthropicMsg{Role: m.Role, Content: m.Content})
	}

	payload := map[string]any{
		"model":      model,
		"max_tokens": 4096,
		"messages":   anthropicMsgs,
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest(http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("anthropic error %d: %s", resp.StatusCode, string(respBody))
	}

	var out struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		Model string `json:"model"`
	}
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, err
	}
	if len(out.Content) == 0 {
		return nil, fmt.Errorf("empty response from Claude")
	}
	return &QueryResponse{Content: out.Content[0].Text, Model: out.Model}, nil
}

// --- OpenAI / Copilot ---

func queryOpenAI(apiKey, model string, msgs []ChatMessage, endpoint string) (*QueryResponse, error) {
	type oaiMsg struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	var oaiMsgs []oaiMsg
	for _, m := range msgs {
		oaiMsgs = append(oaiMsgs, oaiMsg{Role: m.Role, Content: m.Content})
	}

	payload := map[string]any{
		"model":    model,
		"messages": oaiMsgs,
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("openai error %d: %s", resp.StatusCode, string(respBody))
	}

	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Model string `json:"model"`
	}
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, err
	}
	if len(out.Choices) == 0 {
		return nil, fmt.Errorf("empty response from OpenAI")
	}
	return &QueryResponse{Content: out.Choices[0].Message.Content, Model: out.Model}, nil
}

// --- Gemini ---

func queryGemini(apiKey, model string, msgs []ChatMessage) (*QueryResponse, error) {
	type part struct {
		Text string `json:"text"`
	}
	type content struct {
		Role  string `json:"role"`
		Parts []part `json:"parts"`
	}
	var contents []content
	for _, m := range msgs {
		role := m.Role
		if role == "assistant" {
			role = "model"
		}
		contents = append(contents, content{Role: role, Parts: []part{{Text: m.Content}}})
	}

	payload := map[string]any{"contents": contents}
	body, _ := json.Marshal(payload)

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
		strings.TrimPrefix(model, "models/"), apiKey)

	req, _ := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("gemini error %d: %s", resp.StatusCode, string(respBody))
	}

	var out struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		ModelVersion string `json:"modelVersion"`
	}
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, err
	}
	if len(out.Candidates) == 0 || len(out.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("empty response from Gemini")
	}
	return &QueryResponse{Content: out.Candidates[0].Content.Parts[0].Text, Model: out.ModelVersion}, nil
}
