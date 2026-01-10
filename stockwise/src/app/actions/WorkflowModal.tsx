import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Progress,
    Text,
    VStack,
    HStack,
    Card,
    CardBody,
    Checkbox,
    Box,
    Badge,
} from '@chakra-ui/react';
import { PendingAction } from './types';

interface WorkflowModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedAction: PendingAction | null;
    onCompleteStep: (stepIndex: number) => void;
}

export default function WorkflowModal({ isOpen, onClose, selectedAction, onCompleteStep }: WorkflowModalProps) {
    const completedStepsCount = selectedAction?.workflow?.filter(s => s.completed).length || 0;
    const totalSteps = selectedAction?.workflow?.length || 0;
    const progressValue = totalSteps > 0 ? (completedStepsCount / totalSteps) * 100 : 0;
    const isActionComplete = selectedAction && totalSteps > 0 && completedStepsCount === totalSteps;

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="xl">
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>{selectedAction?.title} Workflow</ModalHeader>
                <ModalBody>
                    <Text mb={4}>
                        Follow the steps below to resolve this action.
                    </Text>
                    <Progress value={progressValue} size="sm" colorScheme="blue" hasStripe isAnimated mb={4} />

                    {selectedAction?.workflow?.length ? (
                        <VStack spacing={4} align="stretch">
                            {selectedAction.workflow.map((step, index) => (
                                <Card key={index} variant="outline" bg={step.completed ? 'green.50' : 'white'}>
                                    <CardBody>
                                        <HStack spacing={4} justifyContent="space-between">
                                            <HStack spacing={4}>
                                                <Checkbox
                                                    isChecked={step.completed}
                                                    onChange={() => onCompleteStep(index)}
                                                    colorScheme="blue"
                                                    isDisabled={step.completed || (selectedAction.actionType === 'PurchaseOrder' && selectedAction.completedSteps === 0 && index === 1)}
                                                />
                                                <Box>
                                                    <Text fontWeight="medium">{step.title}</Text>
                                                    <Text fontSize="sm" color="gray.600">
                                                        {step.description}
                                                    </Text>
                                                    {step.required && (
                                                        <Badge fontSize="xs" colorScheme="blue" variant="outline" mt={1}>
                                                            Required
                                                        </Badge>
                                                    )}
                                                </Box>
                                            </HStack>
                                            {!step.completed && (
                                                <Button
                                                    size="sm"
                                                    colorScheme="blue"
                                                    onClick={() => onCompleteStep(index)}
                                                    isDisabled={selectedAction.actionType === 'PurchaseOrder' && selectedAction.completedSteps === 0 && index === 1}
                                                >
                                                    {step.title === 'Submit for Approval' ? 'Submit' : 'Complete Step'}
                                                </Button>
                                            )}
                                        </HStack>
                                    </CardBody>
                                </Card>
                            ))}
                        </VStack>
                    ) : (
                        <Text color="gray.500" fontStyle="italic">
                            No workflow steps defined for this action.
                        </Text>
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button variant="ghost" mr={3} onClick={onClose}>
                        Close
                    </Button>
                    {/*{isActionComplete && (
                        <Button
                            colorScheme="green"
                            onClick={() => selectedAction && onCompleteAction(selectedAction)}
                        >
                            Mark as Complete
                        </Button>
                    )}*/}
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}