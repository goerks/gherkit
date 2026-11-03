package ch.bbv.gherkit.example;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

public class StepDefinitions {
    private String name;
    private String greeting;

    @Given("a person named {string}")
    public void aPersonNamed(String name) {
        this.name = name;
    }

    @When("the person is greeted")
    public void thePersonIsGreeted() {
        greeting = "Hello, " + name + "!";
    }

    @Then("the greeting is {string}")
    public void theGreetingIs(String expected) {
        assertEquals(expected, greeting);
    }
}
